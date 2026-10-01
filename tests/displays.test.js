import test from "node:test";
import assert from "node:assert/strict";
import { displayName, findDisplay } from "../electron/displays.js";

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
