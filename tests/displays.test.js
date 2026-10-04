import test from "node:test";
import assert from "node:assert/strict";
import {
	displayName, findDisplay, matchDisplays
} from "../electron/displays.js";

const displays = [
	{
		id:     4,
		label:  "DELL",
		bounds: {
			x: 0, y: 0, width: 1600, height: 900
		}
	},
	{
		id:     5,
		label:  "DELL",
		bounds: {
			x: 1600, y: 0, width: 1600, height: 900
		}
	}
];

test( "identical monitor models receive distinct visible names", () => {
	assert.notEqual( displayName( displays[ 0 ], 4 ), displayName( displays[ 1 ], 4 ) );
	assert.match( displayName( displays[ 0 ], 4 ), /Position 0,0 · ID 4 · Hauptbildschirm/ );
	assert.match( displayName( displays[ 1 ], 4 ), /Position 1600,0 · ID 5/ );
} );

test( "display matching falls back to saved geometry when runtime IDs change", () => {
	assert.equal( findDisplay( displays, {
		displayId: "99", x: 1600, y: 0, width: 1600, height: 900
	} ), displays[ 1 ] );
	assert.equal( findDisplay( displays, {
		displayId: "4", x: 1600, y: 0, width: 1600, height: 900
	} ), displays[ 0 ] );
} );

test( "physical display matching is independent from panorama positions", () => {
	assert.equal( findDisplay( displays, {
		displayId:     "99",
		displayBounds: {
			x: 1600, y: 0, width: 1600, height: 900
		},
		x:      1650,
		y:      0,
		width:  1600,
		height: 900
	} ), displays[ 1 ] );
} );

test( "legacy display assignments survive changed IDs and panorama gaps", () => {
	const changedDisplays = displays.map( ( display, index ) => ( { ...display, id: 33 + index * 2 } ) );
	const monitors = [ {
		id: "left", displayId: "4", x: 0, y: 0, width: 1600, height: 900
	}, {
		id: "right", displayId: "5", x: 1650, y: 0, width: 1600, height: 900
	} ];
	const matches = matchDisplays( changedDisplays, monitors );

	assert.equal( matches.get( "left" ), changedDisplays[ 0 ] );
	assert.equal( matches.get( "right" ), changedDisplays[ 1 ] );
} );
