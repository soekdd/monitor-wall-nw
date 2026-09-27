export const apiTypes = [
  { value: 'google-ambient', title: 'Google Photos Ambient API', help: 'Erfordert die Aufnahme ins Google Photos Partnerprogramm. OAuth-Client: TVs und Geräte mit begrenzter Eingabe.', options: {}, google: true, scope: 'https://www.googleapis.com/auth/photosambient.mediaitems' },
  { value: 'google-picker', title: 'Google Photos Picker API', help: 'Fotos manuell auswählen und lokal importieren. Google Photos Picker API im Cloud-Projekt aktivieren. OAuth-Client: Desktop-App. Die Anmeldung im Browser auf dem Rechner der Bilderwand abschließen. Neue Albumfotos werden nicht automatisch übernommen.', options: {}, google: true, scope: 'https://www.googleapis.com/auth/photospicker.mediaitems.readonly' },
  { value: 'calendar', title: 'Google Calendar API', help: 'calendarId, days. Einen Refresh-Token mit Calendar-Leseberechtigung unter Zugangsdaten hinterlegen.', options: { calendarId: 'primary', days: 7 } },
  { value: 'weather', title: 'Wetter · Open-Meteo', help: 'latitude, longitude: Koordinaten. Keine Zugangsdaten erforderlich.', options: { latitude: 51.05, longitude: 13.74 } },
  { value: 'transit', title: 'Bus & Bahn · VVO', help: 'stop: Haltestelle, minMinutes: Mindestvorlauf, exclude: Ziele ausschließen, limit: Anzahl.', options: { stop: '', minMinutes: 8, exclude: [], limit: 4 } },
  { value: 'school', title: 'Vertretungsplan · JSON', help: 'url: JSON-Endpunkt, class: Klasse. Alternativ rows: Texte oder Objekte mit date, class, lesson, subject, text.', options: { url: '', rows: [] } },
  { value: 'mpd', title: 'MPD', help: 'host, port: Musikserver. Optional password unter Zugangsdaten.', options: { host: '127.0.0.1', port: 6600 } },
  { value: 'cameras', title: 'Kameras', help: 'cameras: [{"name":"Eingang","url":"http://kamera/snapshot.jpg"}]. Optional authorization unter Zugangsdaten.', options: { cameras: [] } },
  { value: 'soccer', title: 'Fußball · OpenLigaDB', help: 'league: Liga (z. B. bl1), season: Startjahr, team: optionaler Namensfilter.', options: { league: 'bl1', season: new Date().getFullYear() } },
];
export const apiTypeForScene = type => ({ 'google-photos': 'google-ambient', 'google-picker': 'google-picker' })[type];
