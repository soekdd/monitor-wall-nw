import test from "node:test";
import assert from "node:assert/strict";
import {
	easterSunday, seasonForDate, seasons
} from "../shared/seasons.js";
import { eligibleScenes } from "../server/scheduler.js";
import { configSchema } from "../server/schema.js";
import { defaults } from "../server/defaults.js";

const localDate = (
	value, hour = 0, minute = 0
) => {
	const [ year, month, day ] = value.split( "-" ).map( Number );
	return new Date(
		year, month - 1, day, hour, minute
	);
};

test( "Gregorian Easter includes century corrections and earliest/latest dates", () => {
	for ( const expected of [ "1818-03-22", "1900-04-15", "1943-04-25", "1954-04-18", "1981-04-19", "2000-04-23", "2024-03-31", "2025-04-20", "2026-04-05", "2027-03-28", "2038-04-25", "2100-03-28" ] ) {
		assert.equal(
			easterSunday( Number( expected.slice( 0, 4 ) ) ).getTime(), localDate( expected ).getTime(), expected
		);
	}
} );

test( "Advent starts on the Saturday before the first Advent Sunday, including November", () => {
	for ( const [ before, start ] of [ [ "2022-11-25", "2022-11-26" ], [ "2023-12-01", "2023-12-02" ], [ "2026-11-27", "2026-11-28" ] ] ) {
		assert.equal( seasonForDate( localDate(
			before, 23, 59
		) ), before.includes( "-12-" ) ? "winter" : "autumn" );
		assert.equal( seasonForDate( localDate( start ) ), "advent" );
	}

	assert.equal( seasonForDate( localDate(
		"2026-12-30", 23, 59
	) ), "advent" );
	assert.equal( seasonForDate( localDate( "2026-12-31" ) ), "new-year-eve" );
	assert.equal( seasonForDate( localDate(
		"2026-12-31", 23, 59
	) ), "new-year-eve" );
	assert.equal( seasonForDate( localDate( "2027-01-01" ) ), "winter" );
} );

test( "Easter covers two weeks before through one week after, including DST changes", () => {
	for ( const [ before, start, end, after ] of [
		[ "2024-03-16", "2024-03-17", "2024-04-07", "2024-04-08" ],
		[ "2026-03-21", "2026-03-22", "2026-04-12", "2026-04-13" ],
		[ "1943-04-10", "1943-04-11", "1943-05-02", "1943-05-03" ]
	] ) {
		assert.equal( seasonForDate( localDate(
			before, 23, 59
		) ), "spring" );
		assert.equal( seasonForDate( localDate( start ) ), "easter" );
		assert.equal( seasonForDate( localDate(
			end, 23, 59
		) ), "easter" );
		assert.equal( seasonForDate( localDate( after ) ), "spring" );
	}
} );

test( "Halloween lasts October 24–31; ordinary seasons apply outside special periods", () => {
	assert.equal( seasonForDate( localDate(
		"2026-10-23", 23, 59
	) ), "autumn" );
	assert.equal( seasonForDate( localDate( "2026-10-24" ) ), "halloween" );
	assert.equal( seasonForDate( localDate(
		"2026-10-31", 23, 59
	) ), "halloween" );
	assert.equal( seasonForDate( localDate( "2026-11-01" ) ), "autumn" );

	for ( const [ date, expected ] of [ [ "2026-01-01", "winter" ], [ "2026-03-01", "spring" ], [ "2026-06-01", "summer" ], [ "2026-09-01", "autumn" ] ] ) {
		assert.equal( seasonForDate( localDate( date ) ), expected );
	}
} );

test( "special seasons override ordinary scene filters while year-round scenes remain eligible", () => {
	for ( const [ date, ordinary, special ] of [ [ "2026-03-22", "spring", "easter" ], [ "2026-10-24", "autumn", "halloween" ], [ "2026-11-28", "autumn", "advent" ], [ "2026-12-25", "winter", "advent" ], [ "2026-12-31", "winter", "new-year-eve" ] ] ) {
		const scene = {
			enabled: true, sources: [ "/demo/alpine.svg" ], hours: []
		};
		const config = {
			scenes: [
				{
					...scene, id: "ordinary", seasons: [ ordinary ]
				},
				{
					...scene, id: "special", seasons: [ special ]
				},
				{
					...scene, id: "both", seasons: [ ordinary, special ]
				},
				{
					...scene, id: "any", seasons: []
				}
			]
		};
		assert.deepEqual( eligibleScenes( config, localDate( date ) ).map( item => item.id ), [ "special", "both", "any" ] );
		config.scenes = config.scenes.slice( 0, 1 );
		assert.deepEqual( eligibleScenes( config, localDate( date ) ), [] );
	}
} );

test( "configuration accepts all eight seasons and still rejects unknown values", () => {
	const config = defaults();
	config.scenes[ 0 ].seasons = seasons.map( season => season.value );
	assert.equal( configSchema.safeParse( config ).success, true );
	config.scenes[ 0 ].seasons.push( "unknown" );
	assert.equal( configSchema.safeParse( config ).success, false );
} );
