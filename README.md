# Monitor Wall

Neue Electron-Anwendung mit Vue 3, Vuetify und einem Node-Backend. Das ursprüngliche NW.js-Projekt bleibt in `old/` als Referenz erhalten. Es wird nicht ausgeführt. Die Bilderwand übernimmt dessen Prinzip: Panoramen über mehrere Monitore, langsam scrollende Großbilder, gerahmte Fotostapel und Informationen über den Bildern. Die Verwaltung ist für Desktop und Smartphone neu gestaltet.

## Start

Node.js 22.12+ (empfohlen: 24 LTS).

```sh
npm install
npm run dev
```

Electron öffnet die Verwaltung. Unter **Monitore** die erkannten physischen Bildschirme zuordnen und das Layout speichern; anschließend öffnen sich deren Bilderwandfenster. Bildschirmkoordinaten und Größen werden bei der Zuordnung übernommen. Virtuelle Monitore ohne Zuordnung dienen der Vorschau. Escape verlässt im jeweiligen Fenster den Vollbildmodus. Die App-Menüleiste bietet Verwaltung und Bilderwandstart.

Für die Verwaltung ohne Electron:

```sh
npm run dev:web
# http://localhost:3210/admin
```

Der Zugangscode erscheint beim Start im Terminal. In Electron erfolgt die lokale Anmeldung automatisch. Unter **Einstellungen** stehen Netzwerkadressen und Zugangscode für das Smartphone. Im gleichen LAN `http://<Rechner-IP>:3210/admin` aufrufen. Der Zugangscode gilt für Medien und API; er wird nur im Sitzungsspeicher des Browsers gehalten. Die Pulldownsteuerung der Wand liegt oben links und wird beim Berühren, Fokussieren oder Überfahren sichtbar.

```sh
npm run build
npm start                  # Electron mit gebautem Frontend
npm run start:web          # Gebautes Frontend ohne Electron
npm run dist               # Installer für das aktuelle Betriebssystem
npm test                   # Backendtests
npm run test:electron      # UI-Smoke-Test in der Electron-Laufzeit
```

Falls eine npm-Konfiguration Installationsskripte blockiert und die Electron-Laufzeit fehlt: `node node_modules/electron/install.js` nachholen. Installer sind vorbereitet; plattformübergreifende Builds und Signierung benötigen die jeweiligen Toolchains/Zertifikate.

## Medien und Wiedergabe

- **Bilderstapel:** mehrere gerahmte, versetzte Bilder pro Monitor; alle zwölf Sekunden wechseln die Fotos synchron.
- **Scrollendes Panorama:** eine gemeinsame, bildschirmübergreifende Fläche mit vertikalem Scrollzyklus. Bilder mit ausreichender Höhe erlauben sichtbares Scrollen; breite Panoramen passen sich der Gesamtleinwand an.
- **Passendes Bild:** vollständiges Bild in der Gesamtleinwand, ohne Beschnitt, gegebenenfalls mit schwarzen Rändern.
- **HTML:** hochgeladene eigenständige HTML-Datei oder externe HTTP(S)-Seite in einem isolierten iframe. Externe Seiten können Einbettung selbst verbieten. Kein Zugriff auf Node oder Verwaltungs-API.
- **Google-Photos-Galerie:** Google-Alben und Sammlungen über die Ambient API als Bilderstapel. Anmeldung und Auswahl direkt im Szeneneditor; automatische Aktualisierung der Fotos ohne dauerhafte Bildspeicherung.

Upload von JPEG, PNG, WebP, GIF, AVIF und HTML, maximal 50 MB pro Datei und 30 Dateien pro Upload. Alternativ URLs eingeben. Die drei mitgelieferten SVG-Landschaften sind lokale Demoillustrationen, keine eigenen Fotos. Kategorien, Prioritäten (1–5), Jahreszeiten und Tagesstunden lassen sich pro Szene ändern. Bei zufälliger Wiedergabe gewichtet die Priorität die Auswahl; die aktuelle Szene wird bei mehreren verfügbaren Szenen nicht direkt wiederholt. Ohne passende Szene erscheint ein Hinweis. Pause hält auch den Scroll- und Stapelfortschritt an.

## Informationsmodule

Über **Modul hinzufügen** lassen sich zusätzliche Module anlegen, beispielsweise ein eigener Vertretungsplan pro Kind oder mehrere Kalender. Monitor, eine von sechs Positionen und Aktualisierungsintervall sind je Modul einstellbar. Module an derselben Position werden untereinander angeordnet. Die externen Daten lädt ausschließlich das Backend. Fehler erscheinen sowohl in der Verwaltung als auch auf der Wand; bereits geladene Daten bleiben bei einem Ausfall sichtbar.

| Modul | Konfiguration |
| --- | --- |
| Datum/Uhrzeit, Bildtitel | Ohne Zugangsdaten, lokal dargestellt |
| Wetter | Open-Meteo, `latitude`, `longitude`; Dresden voreingestellt |
| Bus/Bahn | VVO-Abfahrtsmonitor: `stop`, `minMinutes`, `exclude`, `limit` |
| Vertretungsplan | `url` eines JSON-Endpunkts und optional `class`; alternativ `rows` mit Texten oder `{date,class,lesson,subject,text}` |
| MPD | `host`, `port`; optional `password` unter Zugangsdaten |
| Google Kalender | `calendarId`, `days`; `clientId`, `clientSecret`, `refreshToken` unter Zugangsdaten. OAuth-Anmeldung und Refresh-Token müssen außerhalb dieser App eingerichtet werden, mit Calendar-Leseberechtigung. |
| Kameras | `cameras: [{"name":"Eingang","url":"http://kamera/snapshot.jpg"}]`; Bild/MJPEG-Proxy im Backend. Optional `authorization` unter Zugangsdaten. RTSP wird nicht direkt unterstützt. |
| Fußball | OpenLigaDB: `league`, `season` (Saisonstartjahr), optional `team` als Namensfilter |

Dienstoptionen werden zurzeit in einem erklärten JSON-Editor konfiguriert. Der alte schulabhängige HTML-Scraper wird nicht unverändert übernommen: für die konkrete Schulwebsite ist ein passender Adapter oder JSON-Endpunkt erforderlich. Kalender-OAuth, echte Netzwerkgeräte und externe Dienste müssen mit den eigenen Daten eingerichtet und geprüft werden. Es werden keine alten Passwörter/API-Schlüssel übernommen.

## Speicherung und Architektur

Webmodus: `data/` im Projekt. Electron: `app.getPath('userData')/data`. Mit `WALL_DATA_DIR` lässt sich ein gemeinsamer Speicherort setzen. `WALL_PORT` (Standard 3210) und `WALL_HOST` (Webmodus, Standard `0.0.0.0`) konfigurieren den Server. Desktop- und Webmodus nicht gleichzeitig auf demselben Port starten.

- `settings.json`: Szenen, Monitorgeometrie, Overlays und Wiedergabeeinstellungen.
- `secrets.json`: generierter Zugangscode und Dienstzugangsdaten, nicht Bestandteil des Konfigurationsexports.
- `media/`: hochgeladene Dateien mit zufälligen Dateinamen.

Keine Datenbank. JSON-Dateien werden über temporäre Dateien und Umbenennen geschrieben; Schreibvorgänge sind serialisiert. Beschädigte Einstellungen lösen einen Startfehler aus und werden nicht durch Defaults überschrieben. Zugangsdaten werden mit Dateimodus 0600 gespeichert, sind jedoch keine verschlüsselte Geheimnisablage. Für vollständige Sicherungen das Datenverzeichnis kopieren; der Export in der Verwaltung enthält nur Einstellungen und Medienreferenzen.

`server/` enthält Schema, Persistenz, zentralen Scheduler, Dienstadapter, HTTP-API und Server-Sent Events. Jede Wand und Fernsteuerung erhält denselben Zustand. Gleichzeitige Änderungen an Einstellungen werden anhand einer Revision abgewiesen. Wiedergabeposition/Pause sind Laufzeitzustand; nach Neustart beginnt die Auswahl neu. `electron/` verwaltet isolierte Fenster und reagiert auf Änderungen angeschlossener Displays. `src/` enthält die gemeinsame Vuetify-Oberfläche und den Renderer der virtuellen Leinwand.

Die Verwaltung nutzt HTTP im lokalen Netzwerk. Für Zugriff außerhalb eines vertrauenswürdigen LAN einen HTTPS-Reverse-Proxy oder VPN einsetzen. Den Server nicht ungeschützt ins Internet veröffentlichen. Electron verwendet Sandbox, Context Isolation und deaktivierte Node-Integration entsprechend der [Electron-Sicherheitsdokumentation](https://www.electronjs.org/docs/latest/tutorial/security).

## Altdaten

`old/data/fotos.js_example` enthält lediglich einen Beispiel-Eintrag; eigentliche Bildverzeichnisse und produktive Konfigurationen sind hier nicht vorhanden. Bilder über die Mediathek importieren. Die alten Typen entsprechen: `C` → Bilderstapel, `R` → scrollendes Panorama, `P` → passendes Bild, `I` → HTML. Layout und Add-on-Zuordnungen aus `old/data/data.js` dienen als Grundlage der vier virtuellen Standardmonitore.

## Google-Photos-Galerien

1. In einem eigenen Google-Cloud-Projekt die **Google Photos Ambient API** aktivieren und den OAuth-Zustimmungsbildschirm einrichten. Bei einem Projekt im Testmodus das eigene Google-Konto als Testnutzer hinzufügen. Einen OAuth-Client vom Typ **TVs und Geräte mit begrenzter Eingabe** erstellen. Die Schrittfolge beschreibt [Google](https://developers.google.com/photos/ambient/guides/configure-your-app). Kalender- oder Desktop-OAuth-Clients sind dafür nicht geeignet.
2. **Mediathek → Szene hinzufügen → Google-Photos-Galerie** wählen, einen Titel eingeben und speichern. Der Dialog bleibt für die Einrichtung offen.
3. Unter **OAuth einrichten** Client-ID und Client-Secret speichern. **Mit Google verbinden** starten, die Google-Anmeldung öffnen und den angezeigten Code eingeben. Die Freigabe lässt sich auch auf einem Smartphone durchführen. Die Oberfläche prüft die Anmeldung automatisch.
4. **Galerie verbinden**, danach **Alben bei Google auswählen**. Bei Google die gewünschten Alben oder Sammlungen freigeben; anschließend **Galerie aktualisieren**.
5. Optional im Feld **Angezeigte Galerie** ein einzelnes freigegebenes Album wählen und die Szene speichern. Danach in der Mediathek **Anzeigen** starten.

Mit „Alle ausgewählten Sammlungen“ wird ein von Google zusammengestellter Stapel mit bis zu 100 Fotos angezeigt. Ein einzelnes Album wird paginiert mit bis zu 500 Fotos geladen. Googles Auswahl und Inhaltsfilter können beeinflussen, welche Bilder bereitgestellt werden; die [Ambient-API-Referenz](https://developers.google.com/photos/ambient/reference/rest/v1/mediaItems/list) beschreibt das Verhalten. Direkte öffentliche Freigabelinks werden nicht gescrapt. Die frühere Library API bietet keinen allgemeinen Zugriff auf bestehende oder geteilte Alben mehr; für die Bilderwand wird die aktuelle Ambient API verwendet.

Bildlisten werden alle 40 Minuten erneuert, vor Ablauf der Bildadressen. Vor der Albumauswahl wird entsprechend der Google-Pollingempfehlung gewartet. Manuelle Aktualisierungen sind begrenzt; das Backend beachtet das Limit von 240 Medienlistenaufrufen pro Galerie und Tag innerhalb seiner Laufzeit. Auf mehreren Monitoren erscheinen unterschiedliche Ausschnitte des gemeinsamen Bilderstapels. Die üblichen Szenenfilter, Prioritäten und Pausen gelten auch für Google-Galerien.

Google-Zugangsdaten und die Zuordnung der Google-Geräte zu Szenen liegen ausschließlich in `secrets.json`. Der Konfigurationsexport enthält nur Szeneneinstellungen, keine Tokens, Bildadressen oder Geräteschlüssel. Fotos werden durch einen authentifizierten Backend-Proxy geladen, ohne sie auf die Festplatte zu schreiben. Bei kurzzeitigen Ausfällen bleiben noch gültige Bildreferenzen erhalten; nach 50 Minuten werden sie von der Wiedergabe ausgeschlossen. Ohne Internet gibt es keinen dauerhaften Offline-Fotocache.

Vor dem Entfernen einer Szene oder dem Wechsel ihres Typs **Galerie trennen** wählen. Das entfernt ihre Google-Gerätezuordnung auch bei Google. Andere Google-Galerien bleiben verbunden. Nach Neustarts werden die gespeicherten Zuordnungen verwendet und die Bildlisten neu geladen. Ein Wechsel der OAuth-Client-ID erfordert vorher das Trennen aller Galerien.

Die Integration ist mit simulierten OAuth-/Ambient-Antworten und dem Electron-Renderer getestet. Ein echter Kontotest erfordert die eigene API-Freischaltung und OAuth-Zugangsdaten; Google kann bei Projekteinrichtung, Konto, Testmodus oder API-Zugriff zusätzliche Einschränkungen anzeigen.
