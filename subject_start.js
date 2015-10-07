Redwood.controller("SubjectCtrl", ["$rootScope", "$scope", "RedwoodSubject", 'SynchronizedStopWatch', function($rootScope, $scope, rs, SynchronizedStopWatch) {
    var CLOCK_FREQUENCY = 30;

    $scope.actionShow = false;
    $scope.flowShow = false;
    $scope.actions = [];
    $scope.colors = [ "green", "red", "blue", "black", "yellow" ];
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
                $scope.dev_log("sliding");
                $scope.text = "x: " + ui.value;
                $scope.myTempAction = ui.value;
            },
            change: function( event, ui ) {
                $scope.text = "x: " + ui.value;
                var msg = { "action": ui.value };

                rs.trigger("updateAction", msg);
                rs.send("updateAction", msg);
                $scope.dev_log(ui.value);
            }
        });
        
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

        $scope.dev_log("$scope.actions:");
        $scope.dev_log($scope.actions);

        // End of a sub period (in the "continuous" version, every tick is the end of a sub period)
        if (tick % $scope.ticksPerSubPeriod === 0) {
            var reward = $scope.payoffFunction();
            $scope.rewards.push(reward);
            rs.add_points(reward * $scope.ticksPerSubPeriod / $scope.clock.getDurationInTicks());
        }

    }

    $scope.payoffFunction = function() {
        return 5;
    }

    $("#actionSpace").bind("plotclick", function (event, pos, item) {
        $scope.text = event;
        $scope.dev_log(event);
    });
    $("#actionSpace").bind("plothover", function(event, pos, item) {
        $scope.dev_log(event);
    });

    $scope.logging = true;
    $scope.dev_log = function(msg) {
        if ($scope.logging) console.debug(msg);
    }


}]);
Redwood.directive('actionflot', ['RedwoodSubject', function(rs) {
    return {
        link: function($scope, elem, attr) {

            var plot = [],
                actions = [],
                subPeriods = [],
                loaded = false;

            rs.on_load(function() {
                init();
            });

            function init() {
                for (var i = 0; i < rs.subjects.length; i++) {
                    actions.push({
                        data: [ [0, 0] ],
                        points: { show: true },
                        color: $scope.colors[i]
                    });
                }
                loaded = true;
                replot();
            }
            $scope.$watch('myTempAction', function() {
                $scope.dev_log("watching myTempAction");
                $scope.actions[Number(rs.user_id)-1] = $scope.myTempAction;

                //will trigger rebuild below
            }, true);

            $scope.$watch('actions', function() {
                rebuild();
            }, true);

            function rebuild() {
                actions = [];
                for (var i = 0; i < rs.subjects.length; i++) {
                    var pt = [];
                    if ($scope.actions[i]) {
                        pt.push([$scope.actions[i], $scope.actions[i]*2/5])
                    } else {
                        pt.push([0, 0]);
                    }
                    actions.push({
                        data: pt,
                        points: { show: true },
                        color: $scope.colors[i]
                    });
                }
                replot();
            }

            function replot() {

                if (!loaded) return;

                var xRange = 10;
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
                    },
                    points: { 
                        show: true,
                        radius: 10,
                        lineWidth: 1, 
                        fill: true 
                    }
                };
                var dataset = [];
                
                $.plot(elem, actions, opts);
            }
        }
    }
}]);
Redwood.directive('flowflot', ['RedwoodSubject', function(rs) {
    return {
        link: function($scope, elem, attr) {

            var plot = [],
                opponentPlot = [],
                subPeriods = [],
                loaded = true;

            rs.on_load(function() {
                init();
            });

            function init() {
                console.log("initializing flow payoff");
                if ($scope.ticksPerSubPeriod > 1) {
                    var subPeriod = 0;
                    do {
                        subPeriod += $scope.ticksPerSubPeriod;
                        subPeriods.push(subPeriod / $scope.clock.getDurationInTicks());
                    } while (subPeriod < $scope.clock.getDurationInTicks());
                }
                loaded = true;
                replot();
            }

            $scope.$watch('tick', function(tick) {
                plot.push([($scope.tick - $scope.ticksPerSubPeriod) / $scope.clock.getDurationInTicks(), 5]);
                opponentPlot.push([($scope.tick - $scope.ticksPerSubPeriod) / $scope.clock.getDurationInTicks(), 8])
                replot();
            }, true);

            function replot() {
                $scope.dev_log("replotting flow payoffs");

                if (!loaded) return;

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
                        max: $scope.yMax + ($scope.yMax * 0.2)
                    },
                    series: {
                        shadowSize: 0
                    }
                };
                var dataset = [];
                for (var p = 0; p < subPeriods.length; p++) { //mark each sub-period with a vertical red line
                    dataset.push({
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
                dataset.push({ //plot your rewards as a grey integral
                    data: plot,
                    lines: {
                        fill: true,
                        lineWidth: 0,
                        fillColor: "#468847"
                    },
                    color: "grey"
                });
                dataset.push({ //plot your opponent's rewards as a black line
                    data: opponentPlot,
                    lines: {
                        lineWidth: 2
                    },
                    color: "black"
                });

                dataset.push({ //display the current time indicator as a vertical grey line
                    data: [
                        [$scope.tick / $scope.clock.getDurationInTicks(), opts.yaxis.min],
                        [$scope.tick / $scope.clock.getDurationInTicks(), opts.yaxis.max]
                    ],
                    color: "grey"
                });

                $.plot(elem, dataset, opts);
            }
        }
    }
}]);