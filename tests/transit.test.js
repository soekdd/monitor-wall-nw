import test from "node:test";
import assert from "node:assert/strict";
import { loadWidget, transitLines } from "../server/providers.js";

const vvoDate = milliseconds => `/Date(${milliseconds}-0000)/`;

test( "VVO departures use real time and retain minimum, destination and cancellation filters", () => {
	const now = Date.UTC(
		2026, 9, 3, 10, 0
	);const departures = [
		{
			LineName: "66", Direction: "Zu früh", ScheduledTime: vvoDate( now + 7 * 60000 )
		},
		{
			LineName: "66", Direction: "Freital-Deuben", ScheduledTime: vvoDate( now + 8 * 60000 ), RealTime: vvoDate( now + 10 * 60000 )
		},
		{
			LineName: "88", Direction: "GOPPELN", ScheduledTime: vvoDate( now + 11 * 60000 )
		},
		{
			LineName: "88", Direction: "Nicht anzeigen", ScheduledTime: vvoDate( now + 12 * 60000 )
		},
		{
			LineName: "353", Direction: "Pirna", ScheduledTime: vvoDate( now + 15 * 60000 ), CancelReasons: [ { Reason: "Ausfall" } ]
		}
	];

	assert.deepEqual( transitLines(
		departures, {
			minMinutes: 8, destinationBlacklist: [ " Goppeln " ], exclude: [ "Nicht anzeigen" ], limit: 4
		}, now
	), [ "66  Freital-Deuben  ·  10 min" ] );
} );

test( "Transit widget resolves a VVO stop and loads the JSON departure monitor", async t => {
	const originalFetch = globalThis.fetch;const requests = [];t.after( () => globalThis.fetch = originalFetch );

	globalThis.fetch = async( url, options = {} ) => {
		requests.push( { url: String( url ), options } );

		if ( String( url ).includes( "/pointfinder?" ) ) {
			return Response.json( { Status: { Code: "Ok" }, Points: [ "33000790|||Fritz-Meinhardt-Straße|5653374|4626009|0||" ] } );
		}

		return Response.json( {
			Status:     { Code: "Ok" },
			Departures: [ {
				LineName: "66", Direction: "Mockritz", ScheduledTime: vvoDate( Date.now() + 20 * 60000 )
			} ]
		} );
	};

	const result = await loadWidget(
		{ type: "transit", apiId: "vvo" }, {}, [ {
			id:      "vvo",
			type:    "transit",
			options: {
				stop: "Fritz-Meinhardt-Straße", minMinutes: 8, limit: 4, exclude: []
			}
		} ]
	);

	assert.match( requests[ 0 ].url, /webapi\.vvo-online\.de\/tr\/pointfinder/ );assert.equal( new URL( requests[ 0 ].url ).searchParams.get( "query" ), "Fritz-Meinhardt-Straße" );assert.equal( requests[ 1 ].url, "https://webapi.vvo-online.de/dm" );assert.equal( JSON.parse( requests[ 1 ].options.body ).stopid, "33000790" );assert.match( result.lines[ 0 ], /^66  Mockritz  ·  (19|20) min$/ );
} );

test( "Transit widget loads multiple stops by stable VVO IDs without showing stop names", async t => {
	const originalFetch = globalThis.fetch;const requestedIds = [];t.after( () => globalThis.fetch = originalFetch );

	globalThis.fetch = async( url, options = {} ) => {
		assert.equal( String( url ), "https://webapi.vvo-online.de/dm" );const stopId = JSON.parse( options.body ).stopid;requestedIds.push( stopId );return Response.json( {
			Name:       stopId === "33000790" ? "Fritz-Meinhardt-Straße" : "Georg-Palitzsch-Straße",
			Status:     { Code: "Ok" },
			Departures: [ {
				LineName: stopId === "33000790" ? "66" : "13", Direction: "Zentrum", ScheduledTime: vvoDate( Date.now() + 15 * 60000 )
			} ]
		} );
	};

	const result = await loadWidget(
		{ type: "transit", apiId: "vvo" }, {}, [ {
			id:      "vvo",
			type:    "transit",
			options: {
				stops: [
					{ name: "Fritz-Meinhardt-Straße", id: "33000790" },
					{ name: "Georg-Palitzsch-Straße", id: "33000323" }
				],
				minMinutes: 8,
				limit:      4,
				exclude:    []
			}
		} ]
	);

	assert.deepEqual( requestedIds.sort(), [ "33000323", "33000790" ] );assert.equal( result.lines.length, 2 );assert.match( result.lines[ 0 ], /^66  Zentrum  ·  (14|15) min$/ );assert.match( result.lines[ 1 ], /^13  Zentrum  ·  (14|15) min$/ );
} );
