Redwood.controller("SubjectCtrl", ["$rootScope", "$scope", "RedwoodSubject", 'SynchronizedStopWatch', function($rootScope, $scope, rs, SynchronizedStopWatch) {
    var CLOCK_FREQUENCY = 30;

    $scope.actionShow = false;
    $scope.flowShow = false;

    rs.on_load(function() {

        console.log("loading");
        $scope.flowData = [];
        $scope.actionData = [];



        $scope.yMax = 10;
        var numSubPeriods = rs.config.num_sub_periods || (rs.config.period_length_s * CLOCK_FREQUENCY);
        $scope.ticksPerSubPeriod = Math.max(Math.floor(rs.config.period_length_s * CLOCK_FREQUENCY / numSubPeriods), 1);

        $("#slider").slider({
            value: 5,
            min: 0,
            max: 10,
            step: 1,
            slide: function(event, ui) {
                var msg = { "action": ui.value };
                rs.trigger("updateAction", msg);
                rs.send("updateAction", msg);
                $scope.dev_log(ui.value);
            },
            change: function( event, ui ) {
                $scope.dev_log(ui.value);
            }
        });

        $scope.clock = SynchronizedStopWatch.instance()
            .frequency(1).onTick(processTick)
            .duration(rs.config.period_length_s).onComplete(function() {
                rs.next_period(3);
            });
        
        $scope.actionShow = true;
        $scope.flowShow = true;

        $scope.rewards = [];
        $scope.opponentRewards = [];
        
        $scope.loaded = true;
        
        $scope.clock.start();


    });



    rs.recv("updateAction", function(uid, msg) {
        $scope.dev_log("receiving update action from opponent");
        $scope.opponentAction = msg.action;
    });

    rs.on("updateAction", function(msg) {
        $scope.dev_log("receiving update action myself");
        $scope.myAction = msg.action;
    });


    var processTick = function(tick) {

        $scope.tick = tick;

        // End of a sub period (in the "continuous" version, every tick is the end of a sub period)
        if (tick % $scope.ticksPerSubPeriod === 0) {
            var reward = $scope.payoffFunction();
            $scope.rewards.push(reward);
            rs.add_points(reward * $scope.ticksPerSubPeriod / $scope.clock.getDurationInTicks());
        }

        $scope.dev_log("ticking");
    }

    $scope.payoffFunction = function() {
        return 5;
    }

    $("#actionSpace").bind("plotclick", function (event, pos, item) {
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
                myAction = [2, 1],
                opponentAction = [3, 4],
                opponentPlot = [],
                subPeriods = [],
                loaded = true;

            init();

            function init() {
                console.log("initializing actionspace");
                loaded = true;
                replot();
            }

            $scope.$watch('myAction', function(tick) {
                $scope.dev_log("my action is: " +  $scope.myAction);
                myAction = [ $scope.myAction, 5 ];
                replot();
            }, true);

            $scope.$watch('opponentAction', function(tick) {
                $scope.dev_log("opp action is: " + $scope.opponentAction);
                opponentAction = [ $scope.opponentAction, 6 ];
                replot();
            }, true);

            function replot() {
                $scope.dev_log("replotting actionspace");

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
                        max: $scope.yMax
                    },
                    series: {
                        shadowSize: 0
                    },
                    points: { 
                        show: true, 
                        lineWidth: 4, 
                        fill: true 
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
                dataset.push({
                    data: opponentAction,
                    points: { show: true, radius: 5, fill: true },
                    color: "green"
                });
                dataset.push({
                    data: myAction,
                    points: { show: true, radius: 5, fill: true },
                    color: "red"
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
Redwood.directive('flowflot', ['RedwoodSubject', function(rs) {
    return {
        link: function($scope, elem, attr) {

            var plot = [],
                opponentPlot = [],
                subPeriods = [],
                loaded = true;

            init();

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