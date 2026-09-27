export const seasons = [
	{ title: "Frühling", value: "spring" },
	{ title: "Sommer", value: "summer" },
	{ title: "Herbst", value: "autumn" },
	{ title: "Winter", value: "winter" },
	{ title: "Advent", value: "advent" },
	{ title: "Silvester", value: "new-year-eve" },
	{ title: "Ostern", value: "easter" },
	{ title: "Halloween", value: "halloween" }
];

export function easterSunday( year ) {
	// Gregorian Meeus/Jones/Butcher algorithm; all divisions are integer divisions.
	// Reference: https://degenerateconic.com/computus.html
	const a = year % 19, b = Math.floor( year / 100 ), c = year % 100;
	const d = Math.floor( b / 4 ), e = b % 4;
	const f = Math.floor( ( b + 8 ) / 25 ), g = Math.floor( ( b - f + 1 ) / 3 );
	const h = ( 19 * a + b - d - g + 15 ) % 30;
	const i = Math.floor( c / 4 ), k = c % 4;
	const l = ( 32 + 2 * e + 2 * i - h - k ) % 7;
	const m = Math.floor( ( a + 11 * h + 22 * l ) / 451 );
	const sum = h + l - 7 * m + 114;
	return new Date(
		year, Math.floor( sum / 31 ) - 1, sum % 31 + 1
	);
}

export function seasonForDate( date = new Date() ) {
	const year = date.getFullYear(), month = date.getMonth(), day = date.getDate();
	// Compare local calendar days on a UTC axis so DST never changes day offsets.
	const today = Date.UTC(
		year, month, day
	);
	const dayLength = 86400000;

	if ( month === 11 && day === 31 ) {
		return "new-year-eve";
	}

	const decemberThird = Date.UTC(
		year, 11, 3
	);
	const adventStart = decemberThird - ( new Date( decemberThird ).getUTCDay() + 1 ) * dayLength;

	if ( today >= adventStart && today <= Date.UTC(
		year, 11, 30
	) ) {
		return "advent";
	}

	const easter = easterSunday( year );
	const easterDay = Date.UTC(
		year, easter.getMonth(), easter.getDate()
	);

	if ( today >= easterDay - 14 * dayLength && today <= easterDay + 7 * dayLength ) {
		return "easter";
	}

	if ( month === 9 && day >= 24 ) {
		return "halloween";
	}

	return [ "winter", "winter", "spring", "spring", "spring", "summer", "summer", "summer", "autumn", "autumn", "autumn", "winter" ][ month ];
}
