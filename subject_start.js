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
    $scope.colors = [ "green", "red", "blue", "black", "yellow", "orange", "purple", "brown" ];

    rs.on_load(function() {
        $scope.text = "x: 0";
        $scope.clock  = SynchronizedStopWatch.instance()
            .frequency(CLOCK_FREQUENCY).onTick(processTick)
            .duration(rs.config.period_length_s).onComplete(function() {
                rs.trigger("move_on");
                
        });


        $scope.yMax = 10;

        var numSubPeriods = rs.config.num_sub_periods || (rs.config.period_length_s * CLOCK_FREQUENCY);
        $scope.throttleStep = rs.config.step || 0;
        $scope.snapDistance = rs.config.snap || 0.1;
        
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

                    $scope.targets[Number(rs.user_id)-1] = ui.value;
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

        

        $scope.clock.start();
    });


    rs.on("move_on", function(msg) {
        $scope.bgColor = "#ccc";
        $("#slider").slider("disable");
        rs.next_period(3);
    });

    rs.recv("updateAction", function(uid, msg) {
        $scope.targets[uid-1] = msg.action;

        $scope.dev_log("receiving update action from opponent");
        $scope.opponentAction = msg.action;
    });

    rs.on("updateAction", function(msg) {
        $scope.targets[Number(rs.user_id)-1] = msg.action;

        $scope.dev_log("receiving update action myself");
        $scope.myAction = msg.action;
    });


    var processTick = function(tick) {
        //causes angular $watch trigger to redraw plots
        $scope.tick = tick;

        // End of a sub period (in the "continuous" version, every tick is the end of a sub period)
        if (tick % $scope.ticksPerSubPeriod === 0) {
            var reward = $scope.payoffFunction(Number(rs.user_id)-1);
            $scope.rewards.push(reward);
            rs.add_points(reward * $scope.ticksPerSubPeriod / $scope.clock.getDurationInTicks());
        }

    }

    $scope.payoffFunction = function(index) {
        //return $scope.bjPricing($scope.actions);
        return $scope.actions[index]*2/5;
    }

    $scope.payoffTargetFunction = function(index) {
        //$scope.bjPricing($scope.targets);
        //return $scope.bjPricing($scope.targets);
        return $scope.targets[index]*2/5;

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
                "id": i+1, //rs user id since array stores from 0->n-1 where n is the number of players
                "action": $scope.actions[i],
                "target": $scope.targets[i],
                "targetPayoff": $scope.payoffTargetFunction(i),
                "actionPayoff": $scope.payoffFunction(i)
            };
            state.push(obj);
        }

        //sort descending
        state.sort(function(a, b) {
            return b.action - a.action;   
        });
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
                        $scope.dev_log("not on target");

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
                actions = [];
                for (var i = 0; i < rs.subjects.length; i++) {
                    var pt = [];

                    //If we're not on target, also plot a grey target dot
                    if ($scope.actions[i] != $scope.targets[i] && (i+1) == rs.user_id) {
                        

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

                    //push the x coordinate as their action and the y coordinate as their payoff
                    pt.push([$scope.actions[i], $scope.payoffFunction(i) ])
                    
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
                var linedata = []

                //Vertical line for selection or at 0,0 for start
                linedata = [
                    [$scope.actions[Number(rs.user_id)-1], 0],
                    [$scope.actions[Number(rs.user_id)-1], 10]
                ];
                

                actions.push({
                    data: linedata,
                    lines: {
                        lineWidth: 1
                    },
                    color: $scope.colors[Number(rs.user_id)-1]
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
                    var filling = false;
                    if ((i+1) == Number(rs.user_id)) {
                        filling = true;
                    }
                    flows[i] = {
                        data: [],
                        lines: {
                            fill: false,
                            lineWidth: 2,
                            fillColor: $scope.colors[i]
                        },
                        color: $scope.colors[i]
                    };
                }
                loaded = true;
                $scope.replotFlow();
            }

            $scope.$watch('tick', function(tick) {
                for(var i = 0; i < rs.subjects.length; i++) {
                    var data = [ ($scope.tick - $scope.ticksPerSubPeriod) / $scope.clock.getDurationInTicks(), $scope.payoffFunction(i) ];
                    flows[i].data.push(data);
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

                for (var p = 0; p < subPeriods.length; p++) { //mark each sub-period with a vertical red line
                    flows.push({
                        data: [
                            [subPeriods[p], opts.yaxis.min],
                            [subPeriods[p], opts.yaxis.max]
                        ],
                        lines: {
                            lineWidth: 1
                        },
                        color: "red"
                    });
                }

                dataset.push({ //display the current time indicator as a vertical grey line
                    data: [
                        [$scope.tick / $scope.clock.getDurationInTicks(), opts.yaxis.min],
                        [$scope.tick / $scope.clock.getDurationInTicks(), opts.yaxis.max]
                    ],
                    color: "grey"
                });

                //now push on each players flow data from init/tick
                for (var i = 0; i < rs.subjects.length; i++) {
                    dataset.push(flows[i]);
                }

                $.plot(elem, dataset, opts);
            }
        }
    }
}]);