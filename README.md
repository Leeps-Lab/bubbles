# bubbles
A modular "framework" for including a bubbles interface

##config fields
>period --must be set and incrementing from 1-> total number of periods

>ymax	[Int]	--sets the ymax setting for height of both plots

>ymin	[Int]	--sets the ymin setting for minimum y value of plots

>period_length_s	[Int]	--sets the length of the period in seconds

>num_sub_periods	[Int]	--sets the discrete time setting for how many subperiods

>action_clickable [Boolean]	--determines whether or not a user can send actions via clicking on the actionspace. If false, user must use slider to change actions

>step	[Int]	--sets the step which determines how fast a user can move towards a specific location per tick. For instance, step = 0.1 means that a user can only move 0.1 units per tick, thus throttling their movement. A target location will be set (that appears in grey), showing in which direction the player will be moving. If this is set to 0, the player will be able to move to their target immediately.

>snap	[Int]	--sets a distance where a player will "snap" to their target location. If 0, this setting is disabled. 

>payoff	[String] --Either stable or unstable, which decides which BJ Pricing payoff function to implement.

>hidePayoffs [Boolean] --sets whether or not the opponents' payoffs are visible

>payoffProjection [Boolean] --determines whether or not the player sees a line on their actionspace representing all possible payoffs for different strategies