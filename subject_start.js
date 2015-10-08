Redwood.controller("SubjectCtrl", ["$rootScope", "$scope", "RedwoodSubject", 'SynchronizedStopWatch', function($rootScope, $scope, rs, SynchronizedStopWatch) {
    var CLOCK_FREQUENCY = 30;

    $scope.actionShow = false;
    $scope.flowShow = false;
    $scope.actions = [];
    $scope.colors = [ "green", "red", "blue", "black", "yellow", "orange", "purple", "brown" ];

    rs.on_load(function() {

        console.log("loading");
        $scope.flowData = [];
        $scope.actionData = [];
        $scope.clock  = SynchronizedStopWatch.instance()
        .frequency(1).onTick(processTick)
        .duration(rs.config.period_length_s).onComplete(function() {
            rs.next_period(3);
        });


        $scope.yMax = 10;
        var numSubPeriods = rs.config.num_sub_periods || (rs.config.period_length_s * CLOCK_FREQUENCY);
        $scope.ticksPerSubPeriod = Math.max(Math.floor(rs.config.period_length_s * CLOCK_FREQUENCY / numSubPeriods), 1);

        $("#slider").slider({
            value: 0,
            min: 0,
            max: 10,
            step: 0.1,
            slide: function(event, ui) {

                //$scope.dev_log("sliding");
                $scope.text = "x: " + ui.value;

                $scope.actions[Number(rs.user_id)-1] = ui.value;

            },
            change: function( event, ui ) {
                $scope.text = "x: " + ui.value;
                var msg = { "action": ui.value };

                rs.trigger("updateAction", msg);
                rs.send("updateAction", msg);
                $scope.dev_log(ui.value);
            }
        });


        $scope.throttle = function(callback, limit) {
            var wait = false;                  // Initially, we're not waiting
            return function () {               // We return a throttled function
                if (!wait) {                   // If we're not waiting
                    callback.call();           // Execute users function
                    wait = true;               // Prevent future invocations
                    setTimeout(function () {   // After a period of time
                        wait = false;          // And allow future invocations
                    }, limit);
                }
            }
        }
        
        $scope.actionShow = true;
        $scope.flowShow = true;

        $scope.rewards = [];
        $scope.opponentRewards = [];
        
        $scope.loaded = true;
        
        $scope.clock.start();


    });



    rs.recv("updateAction", function(uid, msg) {
        $scope.actions[uid-1] = msg.action;

        $scope.dev_log("receiving update action from opponent");
        $scope.opponentAction = msg.action;
    });

    rs.on("updateAction", function(msg) {
        $scope.actions[Number(rs.user_id)-1] = msg.action;

        $scope.dev_log("receiving update action myself");
        $scope.myAction = msg.action;
    });


    var processTick = function(tick) {

        $scope.tick = tick;

        // End of a sub period (in the "continuous" version, every tick is the end of a sub period)
        if (tick % $scope.ticksPerSubPeriod === 0) {
            var reward = $scope.payoffFunction(Number(rs.user_id)-1);
            $scope.rewards.push(reward);
            rs.add_points(reward * $scope.ticksPerSubPeriod / $scope.clock.getDurationInTicks());
        }

    }

    $scope.payoffFunction = function(index) {
        if (!isNaN($scope.actions[index]))
            return $scope.actions[index]*2/5;
        else
            return 0;
    }


    $scope.logging = true;
    $scope.dev_log = function(msg) {
        if ($scope.logging) console.debug(msg);
    }


}]);

//
//  controls main actionspace
//
Redwood.directive('actionflot', ['RedwoodSubject', function(rs) {
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
            }

            $scope.$watch('actions', function() {
                rebuild();
            }, true);

            function rebuild() {
                actions = [];
                for (var i = 0; i < rs.subjects.length; i++) {
                    var pt = [];
                    if (!isNaN($scope.actions[i])) {
                        pt.push([$scope.actions[i], $scope.payoffFunction(i) ])
                    } else {
                        pt.push([0, 0]);
                    }
                    actions.push({
                        data: pt,
                        points: { 
                            show: true, 
                            radius: 10, 
                            lineWidth: 1, 
                            fill: true,
                            fillColor: $scope.colors[i]
                        },
                        color: $scope.colors[i]
                    });
                }
                var linedata = []

                //Vertical line for selection or at 0,0 for start
                if (!isNaN($scope.actions[Number(rs.user_id)-1])) {
                    linedata = [
                        [$scope.actions[Number(rs.user_id)-1], 0],
                        [$scope.actions[Number(rs.user_id)-1], 10]
                    ];
                } else {
                    linedata = [
                        [0, 0],
                        [0, 10]
                    ]
                }

                actions.push({
                    data: linedata,
                    lines: {
                        lineWidth: 1
                    },
                    color: $scope.colors[Number(rs.user_id)-1]
                });
                $scope.dev_log(actions);
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
                    $scope.dev_log("payoff for player " + (i+1) + " is " + $scope.payoffFunction(i));
                    flows[i].data.push(data);
                }
                $scope.replotFlow();
            }, true);

            $scope.replotFlow = function() {

                if (!loaded) return;
                $scope.dev_log(flows);
                var xRange = 1;
                var opts = {
                    xaxis: {
                        ticks: 0,
                        tickLength: 0,
                        min: 0,
                        max: xRange
                    },
                    yaxis: {
                        tickLength: 0,
                        min: 0,
                        max: $scope.yMax
                    },
                    series: {
                        shadowSize: 0
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