Redwood.controller("SubjectCtrl", ["$rootScope", "$scope", "RedwoodSubject", 'SynchronizedStopWatch', function($rootScope, $scope, rs, SynchronizedStopWatch) {
    
    //Controls tick frequency for refreshing of flow chart
    var CLOCK_FREQUENCY = 5;
    var LOG_FREQUENCY = 1;

    //Controls how often the slider is allowed
    // to update the user's value. In ms.
    var SLIDER_REFRESH_TIME = 60;

    $scope.actionShow = false;
    $scope.flowShow = false;
    $scope.histShow = false;
    $scope.actions = [];
    $scope.discreteActions = [];
    $scope.targets = [];
    $scope.discreteTargets = [];
    $scope.colors = ["#b7184d", "#0174f7", "black", "yellow", "orange", "purple", "brown" ];
    $scope.myColor = "#5dbb00";
    $scope.data = [];
    $scope.ids = [];
    $scope.payoffs = [];
    $scope.subPeriodNum = -1;
    $scope.NUMHORIZLINES = 5;

    rs.on_load(function() {

        $scope.text = "x: 0";
        $scope.accPayoffText = "Accumulated Rewards: " + rs.accumulated_points.toFixed(2);

        $scope.clock  = SynchronizedStopWatch.instance()
            .frequency(CLOCK_FREQUENCY).onTick(processTick)
            .duration(rs.config.period_length_s).onComplete(function() {
                rs.trigger("move_on");
        });
        $scope.logConfig(rs.user_id);
        $scope.colors = shuffleArray($scope.colors);

        $scope.yMax = rs.config.ymax;
        
        if (rs.config.num_sub_periods == 0) {
            $scope.continousGame = true;
        } else {
            $scope.continousGame = false;
        }

        var numSubPeriods = rs.config.num_sub_periods || (rs.config.period_length_s * CLOCK_FREQUENCY);
        $scope.throttleStep = rs.config.step || 0;
        $scope.snapDistance = rs.config.snap || 0.001;
        $scope.hidePayoffs  = rs.config.hidePayoffs || false;
        $scope.histShow  = rs.config.actionHistory || false;
        $scope.payoffHorizon = rs.config.payoffProjection || false;
        $scope.qone = parseFloat(rs.config.q1);
        $scope.qtwo = parseFloat(rs.config.q2);
       // console.log("q1: " + $scope.qone + " q2: " + $scope.qtwo);
        $scope.qthree = parseFloat((1 - $scope.qone - $scope.qtwo).toFixed(2));
        if ($scope.qthree == 0.01) $scope.qthree = 0;
        //console.log("q1: " + $scope.qone + " q2: " + $scope.qtwo + " q3: " + $scope.qthree);
        $scope.mu = rs.config.mu;
        $scope.ticksPerSubPeriod = Math.max(Math.floor(rs.config.period_length_s * CLOCK_FREQUENCY / numSubPeriods), 1);

        $scope.minX = rs.config.minX || 0;
        $scope.maxX = rs.config.maxX || 1;
        $scope.adjustAccuracy = parseFloat(rs.config.adjustAccuracy) || .01;
        $scope.payoffTypeText = "Game Type: " + rs.config.payoffLabel;
        var currSlideTime = new Date().getTime();
        $scope.stepSize = rs.config.maxX/rs.subjects.length;
        
        $scope.initialActions = rs.config.initialActions.replace('[', '').replace(']', '').split(',');
        
        for (var i = 0; i < $scope.initialActions.length; i++) {
            //console.log("Initial Action at: " + i + " is " + parseFloat($scope.initialActions[i]));
            $scope.initialActions[i] = parseFloat($scope.initialActions[i]);
        }

        //console.log("ACTIONS");
        //console.log($scope.initialActions);
        
        //initialize everyone's actions and targets
        for (var i = 0; i < rs.subjects.length; i++) {
            
            $scope.actions[i] = $scope.initialActions[i];
            $scope.discreteActions[i] = $scope.initialActions[i];
            $scope.targets[i] = $scope.initialActions[i];
            $scope.discreteTargets[i] = $scope.initialActions[i];

            var id = rs.subjects[i].user_id;
            var index = $scope.indexFromId(id);
            
            if (index == $scope.indexFromId(rs.user_id)) {
                $scope.myInitialAction = $scope.initialActions[i];
            }
            $scope.ids[index] = id;
        }

        $("#slider").slider({
            value: $scope.myInitialAction,
            min: $scope.minX,
            max: $scope.maxX,
            step: $scope.adjustAccuracy,
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

                rs.send("updateAction", msg);

            }
        });
        
        $scope.actionShow = true;
        $scope.flowShow = true;

        $scope.rewards = [];
        $scope.opponentRewards = [];
        $scope.roundPayoff = 0;

        $scope.bgColor = "white";

        $scope.loaded = true;
        

        $scope.dev_log("calculated index" + $scope.indexFromId(rs.user_id));
        $scope.dev_log(rs);
        $scope.clock.start();

    });


    rs.on("move_on", function(msg) {
        $scope.bgColor = "#ccc";
        $scope.showEnding = true;
        $("#slider").slider("disable");
        rs.next_period(10);
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
        // End of a sub period (in the "continuous" version, every tick is the end of a sub period)
        if (tick % $scope.ticksPerSubPeriod === 0) {
            if (rs.config.num_sub_periods != 0) {
                $scope.subPeriodNum++;
                rs.send("endofsubperiod", {});
            }
            var reward = $scope.payoffFunction($scope.indexFromId(rs.user_id));
            $scope.rewards.push(reward);
            rs.add_points(reward * $scope.ticksPerSubPeriod / $scope.clock.getDurationInTicks());
            $scope.roundPayoff += (reward * $scope.ticksPerSubPeriod / $scope.clock.getDurationInTicks());
            $scope.roundPayoffText = "Round Reward: " + $scope.roundPayoff.toFixed(2);



            // Copy by value, not by reference so we can update them independently.
            // The discrete arrays hold the values of everyone
            // recorded at the end of each sub period
            $scope.discreteActions = $scope.actions.slice();
            $scope.discreteTargets = $scope.actions.slice();

           
        }
        // Discrete arrays need to always hold current info for the current user, they have knowledge
        // of their own actions but not others. The others are updated above in the tick % tickspersubperiod conditional
        // at the end of each subperiod

        $scope.discreteTargets[$scope.indexFromId(rs.user_id)] = $scope.targets[$scope.indexFromId(rs.user_id)];
        $scope.discreteActions[$scope.indexFromId(rs.user_id)] = $scope.actions[$scope.indexFromId(rs.user_id)];


        // This allows us to advance a persons action by a given step and throttling
        // amount. This action allows a person to only move by a certain step per tick
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

                    if ($scope.indexFromId(rs.user_id) == i) {
                        $scope.discreteActions[i] = $scope.discreteTargets[i];
                    }
                
                } else { //else, we can move by a step
                    $scope.actions[i] = $scope.actions[i] + step;
                    if ($scope.indexFromId(rs.user_id) == i) {
                        $scope.discreteActions[i] = $scope.discreteActions[i] + step;
                    }
                }

            } else { 
                //otherwise no throttling and an action should instantaneously be their target
                $scope.actions[i] = $scope.targets[i];
                if ($scope.indexFromId(rs.user_id) == i) {
                    $scope.discreteActions[i] = $scope.targets[i];
                }
            }
        }

        //console.log("about to log");
        if (tick % $scope.ticksPerSubPeriod === 0) {
            //console.log("logging");
            $scope.log(rs.user_id, tick);
        }

        //causes angular $watch trigger to redraw plots
        $scope.tick = tick;
        
    }

    $scope.logCount = 0;
    // data output messages logged only for one user 
    // eliminating redundant logging.
    $scope.log = function(uid, tick) {
        if ($scope.continousGame) {
            if ($scope.logCount == LOG_FREQUENCY) {
               $scope.logCount = 0; 
            } else {
                $scope.logCount++;
                return;
            }
        }

        // Run logging with discreteAction data as state 
        // This works because discreteActions is equal to $scope.actions
        // at the end of every subperiod because of the above 2 lines
        $scope.bjPricing($scope.discreteActions);

        $scope.data = [];
        for (var i = 0; i < $scope.state.length; i++) {
            var obj = $scope.state[i];
            var index = $scope.indexFromId(rs.subjects[i].user_id);
            var newObj = {
                subjectid: rs.subjects[obj.id].user_id,
                action: obj.action,
                rank: obj.rank,
                subperiodNumber: $scope.subPeriodNum,
                payoff: obj.payoff,
                target: $scope.targets[index],
            };
            $scope.data.push(newObj);
        }
        //console.log($scope.data);
        if ($scope.indexFromId(rs.user_id) == 0) {
            //console.log("for sure logging");
            //console.log($scope.data);
            rs.send("state", {state: $scope.data});
            rs.send("actions", {actions: $scope.actions});
            rs.send("targets", {targets: $scope.targets});
        }
    }

    $scope.logConfig = function(uid) {
        if ($scope.indexFromId(rs.user_id) == 1) {
            rs.send("LOG_CONFIG", rs.config);
        }
    }

    $scope.payoffFunction = function(index) {
        $scope.bjPricing($scope.discreteActions);
        for (var i = 0; i < rs.subjects.length; i++) {
            if ($scope.state[i].id == index) return $scope.state[i].payoff
        }
    }

    $scope.discretePayoffFunction = function(index) {
        $scope.bjPricing($scope.discreteActions);
        for (var i = 0; i < rs.subjects.length; i++) {
            if ($scope.state[i].id == index) return $scope.state[i].payoff
        }
    }

     $scope.actionForI = function(index) {
        $scope.bjPricing($scope.actions);
        for (var i = 0; i < rs.subjects.length; i++) {
            if ($scope.state[i].id == index) return $scope.state[i].action
        }
     }

    $scope.payoffTargetFunction = function(index) {
        $scope.bjPricing($scope.discreteTargets);
        for (var i = 0; i < rs.subjects.length; i++) {
            if ($scope.state[i].id == index) return $scope.state[i].payoff
        }
    }

    $scope.payoffDiscreteTarget = function(index) {
        $scope.bjPricing($scope.discreteTargets);
        for (var i = 0; i < rs.subjects.length; i++) {
            if ($scope.state[i].id == index) return $scope.state[i].payoff
        }
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
        // so we can use state to represent the payoff for different things.
        $scope.state = [];

        for (var i = 0; i < array.length; i++) {
            var obj = {
                "id": i, //rs user id since array stores from 0->n-1 where n is the number of players
                "action": array[i] || null,
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

            var index = $scope.indexFromId(i);
            thiselem.subjectid = $scope.ids[index]

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


            var minusOne = (elem.rank-1) / (rs.subjects.length-1);
            var minusTwo = (elem.rank-2) / (rs.subjects.length-2);
            
            var rightTerm;
            if (isNaN(minusTwo) || !isFinite(minusTwo)) {
                rightTerm = 0;
            } else {
                rightTerm = Math.max(0, minusOne * minusTwo);
            }

            payoff = $scope.mu * elem.action * ($scope.qone + 2*$scope.qtwo*minusOne + 3*$scope.qthree*rightTerm);
               
            

            // set each element's payoff attribute
            // to the calculated payoff. Therefor we calculate
            // every single player's payoff, and can filter
            // for a specific player's payoff later.
            elem.payoff = payoff;
        }
        return $scope.state;
    }

    $scope.indexFromId = function(id) {
        for (var i = 0; i < rs.subjects.length; i++) {
            if (rs.subjects[i].user_id == id) return i; 
        }
    }


    $scope.logging = false;
    $scope.dev_log = function(msg) {
        if ($scope.logging) console.debug(msg);
    }

    function shuffleArray(array) {
        for (var i = array.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var temp = array[i];
            array[i] = array[j];
            array[j] = temp;
        }
        return array;
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
                discreteActions = [],
                loaded = false;

            rs.on_load(init);

            //initialize our actions data array starting everyone at (0,0)
            function init() {
                for (var i = 0; i < rs.subjects.length; i++) {
                    actions.push({
                        data: [ [0, 0] ],
                        points: { show: true },
                        color: $scope.colors[i]
                    });
                }

                var actionopts = {
                    xaxis: {
                        ticks: 0,
                        tickLength: 0,
                        min: $scope.minX,
                        max: $scope.maxX,
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
                        markings: [],
                        backgroundColor: $scope.bgColor
                    }
                };
                for (var i = 1; i < $scope.NUMHORIZLINES; i++) {
                    actionopts.grid.markings.push(
                        {
                            color: '#eee',
                            yaxis: {
                                from: i * ($scope.yMax/$scope.NUMHORIZLINES),
                                to: i * ($scope.yMax/$scope.NUMHORIZLINES)
                            }
                        }
                    );
                }
                $scope.mainGraph = $.plot(elem, [], actionopts);
                $scope.mainElemWidth = elem.width();

                loaded = true;
                rebuild();
            }

            $(elem).bind("onclick", function (event, pos, item) {
                $scope.dev_log("clicked");
            });

            $(elem).bind("onhover", function (event, pos, item) {
                $scope.dev_log("hovered");
            });

            $scope.$watch('bgColor', function() {
                if ($scope.mainGraph) {
                    $scope.mainGraph.getOptions().grid.backgroundColor = $scope.bgColor;
                    $scope.mainGraph.setupGrid();
                    $scope.mainGraph.draw();
                }
            }, true);

            $scope.$watch('tick', function(tick) {
                rebuild();
            }, true);


            function rebuild() {
                if (!loaded) return;

                if(elem.width() != $scope.mainElemWidth) {
                    $scope.mainElemWidth = elem.width();
                    $scope.mainGraph.resize();
                    $scope.mainGraph.setupGrid();
                }

                /* Flot data structure */
                actions = [];


                /* Main logic loop for building up data for each player */
                for (var i = 0; i < rs.subjects.length; i++) {
                    var pt = [];

                    //If we're not on our target, also plot a grey target dot
                    if ($scope.actions[i] != $scope.targets[i] && $scope.indexFromId(rs.user_id) == i) {
                        

                        //push the x coordinate as their target and the y coordinate as their target payoff
                        pt.push([$scope.discreteTargets[i], $scope.payoffTargetFunction(i) ])
                        
                        
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

                    // plot hollow circle for current action for this tick
                    pt = [];
                    if ( $scope.indexFromId(rs.user_id) == i ) {
                        //console.log("My payoff: " + $scope.discretePayoffFunction(i));
                        //console.log($scope.discreteActions);
                        pt.push([$scope.discreteActions[i], $scope.discretePayoffFunction(i) ]);
                    } else {
                        if ($scope.hidePayoffs) {
                            pt.push([$scope.discreteActions[i], 0 ])
                        } else {
                            pt.push([$scope.discreteActions[i], $scope.discretePayoffFunction(i) ])
                        }

                    }

                    var fillColor = $scope.colors[i];

                    if ( $scope.indexFromId(rs.user_id) == i ) {
                        actions.push({
                            data: pt,
                            points: { 
                                show: true, 
                                radius: 10, 
                                lineWidth: 1, 
                                fill: false,
                                fillColor: $scope.myColor
                            },
                            color: $scope.myColor
                        });
                    } else {
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
                    }

                    if ($scope.payoffHorizon && $scope.indexFromId(rs.user_id) == i) {

                        var projectionData = [];
                        var j = 0;

                        /* 
                            Save the correct (current) target so we can 
                            re-simulate the payoff function with a new target
                        */
                        var targ = $scope.discreteActions[$scope.indexFromId(rs.user_id)];

                        while (j < 10) {
                            

                            /* Set the target equal to a number between 0-10 */
                            $scope.discreteActions[$scope.indexFromId(rs.user_id)] = j;

                            /* Run the payoff function with the new (projected) target */
                            projectionData.push([j, $scope.discretePayoffFunction(i)]);
                            
                            /* inrecement j to get the next projected payoff at new location j*/
                            j += $scope.adjustAccuracy; 
                            
                           
                        }
                        /* 
                            After we're done building our projection data, reset the target to the
                            correct (actual) value and append this data to our flot dataset
                        */
                        $scope.actions[$scope.indexFromId(rs.user_id)] = targ;
                        $scope.discreteActions[$scope.indexFromId(rs.user_id)] = targ;

                        actions.push({
                            data: projectionData,
                            lines: {
                                lineWidth: 2
                            },
                            color: "#888888"
                        });
                    }

                }
                var linedata = []

                //Vertical line for selection or at 0,0 for start
                linedata = [
                    [$scope.discreteActions[$scope.indexFromId(rs.user_id)], 0],
                    [$scope.discreteActions[$scope.indexFromId(rs.user_id)], $scope.yMax]
                ];
                

            
                actions.push({
                    data: linedata,
                    lines: {
                        lineWidth: 1
                    },
                    color: $scope.myColor
                });
        
                $scope.mainGraph.setData(actions);
                $scope.mainGraph.draw();
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

            rs.on_load(init);

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
                        markings: [
                        ],
                        backgroundColor: $scope.bgColor
                    }
                };

                for (var i = 1; i < $scope.NUMHORIZLINES; i++) {
                    opts.grid.markings.push(
                        {
                            color: '#eee',
                            yaxis: {
                                from: i * ($scope.yMax/$scope.NUMHORIZLINES),
                                to: i * ($scope.yMax/$scope.NUMHORIZLINES)
                            }
                        }
                    );
                }

                $scope.payoffGraph = $.plot(elem, [], opts);
                $scope.payoffElemWidth = elem.width();

                loaded = true;
                $scope.replotFlow();
            }

            $scope.$watch('tick', function(tick) {
                if (tick % $scope.ticksPerSubPeriod === 0) {
                    for(var i = 0; i < rs.subjects.length; i++) {
                        var data = [ ($scope.tick - $scope.ticksPerSubPeriod) / $scope.clock.getDurationInTicks(), $scope.discretePayoffFunction(i) ];
                        flows[i].push(data);

                        var data = [ ($scope.tick) / $scope.clock.getDurationInTicks(), $scope.discretePayoffFunction(i) ];
                        flows[i].push(data);
                    }
                }
                $scope.replotFlow();
            }, true);

            //watch for end of period to change color of bg
            $scope.$watch('bgColor', function() {
                if ($scope.payoffGraph) {
                    $scope.payoffGraph.getOptions().grid.backgroundColor = $scope.bgColor;
                    $scope.payoffGraph.setupGrid();
                    $scope.payoffGraph.draw();
                }
            }, true);

            $scope.replotFlow = function() {

                if (!loaded) return;

                if ($scope.payoffElemWidth != elem.width()) {
                    $scope.payoffElemWidth = elem.width();
                    $scope.payoffGraph.resize();
                    $scope.payoffGraph.setupGrid();
                }
                
                var dataset = [];
                for (var p = 0; p < subPeriods.length; p++) { //mark each sub-period with a vertical red line
                    dataset.push({
                        data: [
                            [subPeriods[p], 0],
                            [subPeriods[p], $scope.yMax]
                        ],
                        lines: {
                            lineWidth: 1
                        },
                        color: "red"
                    });
                }
                dataset.push({ //display the current time indicator as a vertical grey line
                    data: [
                        [$scope.tick / $scope.clock.getDurationInTicks(), 0],
                        [$scope.tick / $scope.clock.getDurationInTicks(), $scope.yMax]
                    ],
                    color: "grey"
                });


                /* First plot our own payoff data so we can shade it and put other payoffs ontop */
                dataset.push({
                    data: flows[$scope.indexFromId(rs.user_id)],
                    lines: {
                            fill: true,
                            lineWidth: 2,
                            fillColor: $scope.myColor
                    },
                    color: $scope.myColor
                });

                for (var i = 0; i < rs.subjects.length; i++) {
                    if ($scope.indexFromId(rs.user_id) != i && !$scope.hidePayoffs) {
                        dataset.push({
                            data: flows[i],
                            lines: {
                                fill: false,
                                lineWidth: 3
                            },
                            color: $scope.colors[i]
                        });
                    }

                }
                //console.log("STATE");
                //console.log($scope.state);

                $scope.payoffGraph.setData(dataset);
                $scope.payoffGraph.draw();
            }
        }
    }
}]);
//
//  controls action history flot graph
//
Redwood.directive('actionHistory', ['RedwoodSubject', function(rs) {
    return {
        link: function($scope, elem, attr) {

            var plot = [],
                flows = [[]],
                opponentPlot = [],
                subPeriods = [],
                loaded = false;

            rs.on_load(init);

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
                        min: rs.config.minX,
                        max: rs.config.maxX
                    },
                    series: {
                        shadowSize: 0
                    },
                    grid: {
                        backgroundColor: $scope.bgColor
                    }
                };

                $scope.actionGraph = $.plot(elem, [], opts)
                $scope.actionElemWidth = elem.width();

                $scope.replotHist();
            }

            $scope.$watch('tick', function(tick) {
                if (tick % $scope.ticksPerSubPeriod === 0) {
                    for(var i = 0; i < rs.subjects.length; i++) {
                        var data = [ ($scope.tick - $scope.ticksPerSubPeriod) / $scope.clock.getDurationInTicks(), $scope.actionForI(i) ];
                        flows[i].push(data);

                        var data = [ ($scope.tick) / $scope.clock.getDurationInTicks(), $scope.actionForI(i) ];
                        flows[i].push(data);
                    }
                }

                $scope.replotHist();
            }, true);

            //watch for end of period to change color of bg
            $scope.$watch('bgColor', function() {
                if($scope.actionGraph) {
                    $scope.actionGraph.getOptions().grid.backgroundColor = $scope.bgColor;
                    $scope.actionGraph.setupGrid();
                    $scope.actionGraph.draw();
                }
            }, true);

            $scope.replotHist = function() {

                if (!loaded) return;

                if ($scope.actionElemWidth != elem.width()) {
                    $scope.actionElemWidth = elem.width();
                    $scope.actionGraph.resize();
                    $scope.actionGraph.setupGrid();
                }
                
                var dataset = [];

                for (var p = 0; p < subPeriods.length; p++) { //mark each sub-period with a vertical red line
                    dataset.push({
                        data: [
                            [subPeriods[p], rs.config.minX],
                            [subPeriods[p], rs.config.maxX]
                        ],
                        lines: {
                            lineWidth: 1
                        },
                        color: "red"
                    });
                }

                dataset.push({ //display the current time indicator as a vertical grey line
                    data: [
                        [$scope.tick / $scope.clock.getDurationInTicks(), rs.config.minX],
                        [$scope.tick / $scope.clock.getDurationInTicks(), rs.config.maxX]
                    ],
                    color: "grey"
                });


                /* First plot our own payoff data so we can shade it and put other payoffs ontop */
                dataset.push({
                    data: flows[$scope.indexFromId(rs.user_id)],
                    lines: {
                            fill: false,
                            lineWidth: 2,
                            fillColor: $scope.myColor
                    },
                    color: $scope.myColor
                });

                for (var i = 0; i < rs.subjects.length; i++) {
                    if ($scope.indexFromId(rs.user_id) != i && !$scope.hideActions) {
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


                $scope.actionGraph.setData(dataset);
                $scope.actionGraph.draw();
            }
        }
    }
}]);