Redwood.controller("SubjectCtrl", ["$rootScope", "$scope", "RedwoodSubject", 'SynchronizedStopWatch', function($rootScope, $scope, rs, SynchronizedStopWatch) {
    
    //Controls tick frequency for refreshing of flow chart
    var CLOCK_FREQUENCY = 10;

    //Controls how often the slider is allowed
    // to update the user's value. In ms.
    var SLIDER_REFRESH_TIME = 45;

    $scope.actionShow = false;
    $scope.flowShow = false;
    $scope.actions = [];
    $scope.targets = [];
    $scope.colors = [ "#5dbb00", "#b7184d", "#0174f7", "black", "yellow", "orange", "purple", "brown" ];

    rs.on_load(function() {
        $scope.text = "x: 0";

        $scope.clock  = SynchronizedStopWatch.instance()
            .frequency(CLOCK_FREQUENCY).onTick(processTick)
            .duration(rs.config.period_length_s).onComplete(function() {
                rs.trigger("move_on");
        });


        $scope.yMax = rs.config.ymax;

        var numSubPeriods = rs.config.num_sub_periods || (rs.config.period_length_s * CLOCK_FREQUENCY);
        $scope.throttleStep = rs.config.step || 0;
        $scope.snapDistance = rs.config.snap || 0.1;
        $scope.hidePayoffs  = rs.config.hidePayoffs || false;
        $scope.payoffHorizon = rs.config.payoffProjection || false;
        $scope.q1 = eval(rs.config.q1);
        $scope.q2 = eval(rs.config.q2);
        $scope.q3 = 1-$scope.q1-$scope.q2;
        $scope.mu = rs.config.mu;
        $scope.ticksPerSubPeriod = Math.max(Math.floor(rs.config.period_length_s * CLOCK_FREQUENCY / numSubPeriods), 1);

        var currSlideTime = new Date().getTime();

        $("#slider").slider({
            value: 0,
            min: 0,
            max: 10,
            step: 0.1,
            slide: function(event, ui) {
                var nowSlide = new Date().getTime();
                var diff = nowSlide - currSlideTime;


                //If this wasn't here, everytime a user changed selection by 0.1 the code
                //would fire redwood messages and overload the router. This way, we check to see
                //if it's been at least SLIDER_REFRESH_TIME since the last time the slide action is
                //fired. Set via parameter in ms.
                if (diff > SLIDER_REFRESH_TIME) {
                    $scope.text = "x: " + ui.value;
                    var msg = { "action": ui.value };

                    rs.trigger("updateAction", msg);
                    rs.send("updateAction", msg);
                    
                    //we've slid
                    currSlideTime = new Date().getTime();

                } else { //otherwise, let's set some temp flags incase we tick in between
                    
                    $scope.text = "x: " + ui.value;

                    $scope.targets[$scope.indexFromId(rs.user_id)] = ui.value;
                }

            },
            change: function( event, ui ) {
                $scope.text = "x: " + ui.value;
                var msg = { "action": ui.value };

                rs.trigger("updateAction", msg);
                rs.send("updateAction", msg);

            }
        });
        
        $scope.actionShow = true;
        $scope.flowShow = true;

        $scope.rewards = [];
        $scope.opponentRewards = [];
        
        $scope.bgColor = "white";

        $scope.loaded = true;
        

        //initialize everyone's actions and targets
        for (var i = 0; i < rs.subjects.length; i++) {
            $scope.actions[i] = 0;
            $scope.targets[i] = 0;
        }

        $scope.dev_log("calculated index" + $scope.indexFromId(rs.user_id));
        $scope.dev_log(rs);
        $scope.clock.start();
    });


    rs.on("move_on", function(msg) {
        $scope.bgColor = "#ccc";
        $("#slider").slider("disable");
        rs.next_period(3);
    });

    rs.recv("updateAction", function(uid, msg) {
        var index = $scope.indexFromId(uid)
        $scope.dev_log("updating another's action at index: " + index);
        $scope.targets[index] = msg.action;

        $scope.opponentAction = msg.action;
    });

    rs.on("updateAction", function(msg) {
        var index = $scope.indexFromId(rs.user_id);
        $scope.dev_log("updating my action at index: " + index);
        $scope.targets[index] = msg.action;

        $scope.myAction = msg.action;
    });


    var processTick = function(tick) {
        //causes angular $watch trigger to redraw plots
        $scope.tick = tick;

        // have the last person in each group log the data
        if ( (parseInt(rs.user_id) % rs.subjects.length) == 0) rs.send("state_sync", { state: $scope.state });
        
        // End of a sub period (in the "continuous" version, every tick is the end of a sub period)
        if (tick % $scope.ticksPerSubPeriod === 0) {
            var reward = $scope.payoffFunction($scope.indexFromId(rs.user_id));
            $scope.rewards.push(reward);
            rs.add_points(reward * $scope.ticksPerSubPeriod / $scope.clock.getDurationInTicks());
        }

    }

    $scope.payoffFunction = function(index) {
        $scope.bjPricing($scope.actions);
        for (var i = 0; i < rs.subjects.length; i++) {
            if ($scope.state[i].id == index) return $scope.state[i].payoff
        }
    }

    $scope.payoffTargetFunction = function(index) {
        $scope.bjPricing($scope.targets);
        for (var i = 0; i < rs.subjects.length; i++) {
            if ($scope.state[i].id == index) return $scope.state[i].payoff
        }
    }

    $scope.payoffWithLocation = function(array) {
        var state = $scope.bjPricing(array);
    }


    $scope.state = [];

    // takes an array of player locations either target or action depending on what we're plotting
    //
    // Array is formatted like so:
    //
    // [1.3, 1.2, 0.8, ... , n]
    // where the first element correspons to player 1, 
    // second corresponds to player 2, etc. These indecies start at 0 but
    // subject numbers start at 1, so we add one to index counter to get id.

    $scope.bjPricing = function(array) {

        //each time we run our payoff function, let's just rebuild state
        $scope.state = [];

        for (var i = 0; i < array.length; i++) {
            var obj = {
                "id": i, //rs user id since array stores from 0->n-1 where n is the number of players
                "action": array[i],
                "rank": 0,
                "payoff": 0
            };
            $scope.state.push(obj);
        }

        //sort descending
        $scope.state.sort(function(a, b) {
            return b.action - a.action;   
        });

        //in the event of a tie, we need a counter to keep track so we advance 
        // rank in the case of a tie.
        var extraRank = 0;
        for (var i = 0; i < $scope.state.length; i++) {
            var thiselem   = $scope.state[i],
                nextelem   = $scope.state[i+1],
                rank       = i+1;

            //if we're on the last element, and the rank hasn't been set yet
            if (nextelem == null) {
                if (thiselem.rank == 0) {
                    thiselem.rank = rank;
                }
                continue;
            }

            if (thiselem.action == nextelem.action) {
                //in the event of a tie, they recieve rank equal to 
                // the average of the ranks they would recieve
                thiselem.rank = nextelem.rank = ((rank) + (rank+1)) / 2;
                //the next iteration needs to know we've had a tie so the i rank counter
                // is no longer exactly correct
                extraRank++;
            } else if (thiselem.rank == 0) {
                thiselem.rank = rank;
            } 
            // else thiselem rank has already been set by the earlier loop iteration
            // where there was a tie, and in that case both ranks have been set already
            
        }

        for (var i = 0; i < $scope.state.length; i++) {
            var elem = $scope.state[i];
            var payoff = 0;

            if (rs.config.payoff == "stable") {
                /*
                var numerator = ((elem.rank-1) * (elem.rank-2));
                var denominator = ((rs.subjects.length-1) * (rs.subjects.length-2));
                var scalar = 0;
                if (denominator == 0) {
                    scalar = 0;
                } else {
                    scalar = Math.max(0, numerator / denominator);
                }
                */
                
                //payoff = 75 * elem.action * (1 + scalar);

                var minusOne = (elem.rank-1) / (rs.subjects.length-1);
                var minusTwo = (elem.rank-2) / (rs.subjects.length-2);
                
                var rightTerm;

                // If rs.subjects.length <= 2, then one of these terms will be infinity (division by 0)
                if (isNaN(minusTwo) || !isFinite(minusTwo)) {
                    rightTerm = 0;
                } else {
                    rightTerm = Math.max(0, minusOne * minusTwo);
                }

                payoff = $scope.mu * ($scope.q1 + 2*$scope.q2*minusOne + 3*$scope.q3*rightTerm);
               
                
            } else if (rs.config.payoff == "unstable") {
                payoff = 66.6 * elem.action * (1 + ((elem.rank-1))/(rs.subjects.length-1));
            }

            elem.payoff = payoff;
        }

        return $scope.state;

    }

    $scope.indexFromId = function(id) {
        var index = 0;
        for (var i = 0; i < rs.subjects.length; i++) {
            if (parseInt(rs.subjects[i].user_id) < id) index++; 
        }
        return index;
    }


    $scope.logging = true;
    $scope.dev_log = function(msg) {
        if ($scope.logging) console.debug(msg);
    }


}]);

//
//  controls main actionspace
//
Redwood.directive('actionFlot', ['RedwoodSubject', function(rs) {
    return {
        link: function($scope, elem, attr) {

            var actions = [],
                subPeriods = [],
                loaded = false;

            rs.on_load(function() {
                init();
            });


            //initialize our actions data array starting everyone at (0,0)
            function init() {
                for (var i = 0; i < rs.subjects.length; i++) {
                    actions.push({
                        data: [ [0, 0] ],
                        points: { show: true },
                        color: $scope.colors[i]
                    });
                }
                loaded = true;
                rebuild();
                console.log(elem);
            }

            $(elem).bind("onclick", function (event, pos, item) {
                $scope.dev_log("clicked");
            });

            $(elem).bind("onhover", function (event, pos, item) {
                $scope.dev_log("hovered");
            });

            $scope.$watch('actions', function() {
                rebuild();
            }, true);

            $scope.$watch('bgColor', function() {
                rebuild();
            }, true);


            //this allows us to advance a persons action by a given step and throttling
            // amount. This action allows a person to only move by a certain step per tick
            $scope.$watch('tick', function(tick) {
                for (var i = 0; i < rs.subjects.length; i++) {

                    var targetDiff = Math.abs($scope.actions[i] - $scope.targets[i]);


                    /* If our difference is greather than the snap distance, and a throttle is set, let's throttle */
                    if (targetDiff > $scope.snapDistance && $scope.throttleStep != 0) {

                        var target = $scope.targets[i],
                            action = $scope.actions[i],
                            step   = 0;

                        //deciding whether our step is going to be positive or negative
                        if (target > action)    step = $scope.throttleStep;
                        else                    step = -$scope.throttleStep;

                        //positive step would set us above target 
                        var stepPosBool = (step > 0) && ((action + $scope.throttleStep) > target);
                        //negative step would set us below target
                        var stepNegBool = (step < 0) && ((action - $scope.throttleStep) < target);
                        

                        //if a step would place us above or below, snap to target
                        if (stepPosBool || stepNegBool) {
                            $scope.actions[i] = $scope.targets[i];
                        
                        
                        } else { //else, we can move by a step
                            $scope.actions[i] = $scope.actions[i] + step;
                        }

                    } else { 
                        //otherwise no throttling and an action should instantaneously be their target
                        $scope.actions[i] = $scope.targets[i];
                    }
                }

                rebuild();
            }, true);


            function rebuild() {
                /* Flot data structure */
                actions = [];


                /* Main logic loop for building up data for each player */
                for (var i = 0; i < rs.subjects.length; i++) {
                    var pt = [];

                    //If we're not on our target, also plot a grey target dot
                    if ($scope.actions[i] != $scope.targets[i] && $scope.indexFromId(rs.user_id) == i) {
                        

                        //push the x coordinate as their target and the y coordinate as their target payoff
                        pt.push([$scope.targets[i], $scope.payoffTargetFunction(i) ])
                        
                        
                        actions.push({
                            data: pt,
                            points: { 
                                show: true, 
                                radius: 10, 
                                lineWidth: 1, 
                                fill: true,
                                fillColor: "grey"
                            },
                            color: "grey"
                        });
                    }
                    pt = [];

                    if ( $scope.indexFromId(rs.user_id) == i ) {
                        pt.push([$scope.actions[i], $scope.payoffFunction(i) ]);
                    } else {
                        if ($scope.hidePayoffs) {
                            pt.push([$scope.actions[i], 0 ])
                        } else {
                            pt.push([$scope.actions[i], $scope.payoffTargetFunction(i) ])
                        }
                    }

                    var fillColor = $scope.colors[i];

                    
                    actions.push({
                        data: pt,
                        points: { 
                            show: true, 
                            radius: 10, 
                            lineWidth: 1, 
                            fill: false,
                            fillColor: $scope.colors[i]
                        },
                        color: $scope.colors[i]
                    });

                    if ($scope.payoffHorizon && $scope.indexFromId(rs.user_id) == i) {

                        var projectionData = [];
                        var j = 0;

                        /* 
                            Save the correct (current) target so we can 
                            re-simulate the payoff function with a new target
                        */
                        var targ = $scope.targets[$scope.indexFromId(rs.user_id)];

                        while (j < 10) {
                            

                            /* Set the target equal to a number between 0-10 */
                            $scope.targets[$scope.indexFromId(rs.user_id)] = j;

                            /* Run the payoff function with the new (projected) target */
                            projectionData.push([j, $scope.payoffTargetFunction(i)]);
                            
                            /* inrecement j to get the next projected payoff at new location j*/
                            j += 0.05; 
                            
                           
                        }
                        /* 
                            After we're done building our projection data, reset the target to the
                            correct (actual) value and append this data to our flot dataset
                        */
                        $scope.targets[$scope.indexFromId(rs.user_id)] = targ;

                        actions.push({
                            data: projectionData,
                            lines: {
                                lineWidth: 2
                            },
                            color: "#eeeeee"
                        });
                    }

                }
                var linedata = []

                //Vertical line for selection or at 0,0 for start
                linedata = [
                    [$scope.actions[$scope.indexFromId(rs.user_id)], 0],
                    [$scope.actions[$scope.indexFromId(rs.user_id)], $scope.yMax]
                ];
                

            
                actions.push({
                    data: linedata,
                    lines: {
                        lineWidth: 1
                    },
                    color: $scope.colors[$scope.indexFromId(rs.user_id)]
                });
        
                replot();
            }

            function replot() {

                if (!loaded) return;
                var actionopts = {
                    xaxis: {
                        ticks: 0,
                        tickLength: 0,
                        min: 0,
                        max: 10,
                        ticks: 10
                    },
                    yaxis: {
                        tickLength: 0,
                        min: 0,
                        max: $scope.yMax
                    },
                    series: {
                        shadowSize: 0
                    },
                    grid: {
                        backgroundColor: $scope.bgColor
                    }
                };
                $.plot(elem, actions, actionopts);
            }


        }
    }
}]);

//
//  controls flow payoff flot graph
//
Redwood.directive('flowflot', ['RedwoodSubject', function(rs) {
    return {
        link: function($scope, elem, attr) {

            var plot = [],
                flows = [[]],
                opponentPlot = [],
                subPeriods = [],
                loaded = false;

            rs.on_load(function() {
                init();
            });

            function init() {
                if ($scope.ticksPerSubPeriod > 1) {
                    var subPeriod = 0;
                    do {
                        subPeriod += $scope.ticksPerSubPeriod;
                        subPeriods.push(subPeriod / $scope.clock.getDurationInTicks());
                    } while (subPeriod < $scope.clock.getDurationInTicks());
                }

                for(var i = 0; i < rs.subjects.length; i++) {
                    flows[i] = [];
                }

                loaded = true;
                $scope.replotFlow();
            }

            $scope.$watch('tick', function(tick) {
                for(var i = 0; i < rs.subjects.length; i++) {
                    var data = [ ($scope.tick - $scope.ticksPerSubPeriod) / $scope.clock.getDurationInTicks(), $scope.payoffFunction(i) ];
                    flows[i].push(data);
                }
                $scope.replotFlow();
            }, true);

            //watch for end of period to change color of bg
            $scope.$watch('bgColor', function() {
                $scope.replotFlow();
            }, true);

            $scope.replotFlow = function() {

                if (!loaded) return;
                var xRange = 1;
                var opts = {
                    xaxis: {
                        ticks: 0,
                        tickLength: 0,
                        min: 0,
                        max: xRange,
                        ticks: 10
                    },
                    yaxis: {
                        tickLength: 0,
                        min: 0,
                        max: $scope.yMax
                    },
                    series: {
                        shadowSize: 0
                    },
                    grid: {
                        backgroundColor: $scope.bgColor
                    }
                };
                var dataset = [];

                dataset.push({ //display the current time indicator as a vertical grey line
                    data: [
                        [$scope.tick / $scope.clock.getDurationInTicks(), opts.yaxis.min],
                        [$scope.tick / $scope.clock.getDurationInTicks(), opts.yaxis.max]
                    ],
                    color: "grey"
                });


                /* First plot our own payoff data so we can shade it and put other payoffs ontop */
                dataset.push({
                    data: flows[$scope.indexFromId(rs.user_id)],
                    lines: {
                            fill: true,
                            lineWidth: 2,
                            fillColor: $scope.colors[$scope.indexFromId(rs.user_id)]
                    },
                    color: $scope.colors[$scope.indexFromId(rs.user_id)]
                });

                for (var i = 0; i < rs.subjects.length; i++) {
                    if ($scope.indexFromId(rs.user_id) != i && !$scope.hidePayoffs) {
                        dataset.push({
                            data: flows[i],
                            lines: {
                                fill: false,
                                lineWidth: 3,
                                fillColor: $scope.colors[$scope.indexFromId(rs.user_id)]
                            },
                            color: $scope.colors[i]
                        });
                    }

                }


                $.plot(elem, dataset, opts);
            }
        }
    }
}]);