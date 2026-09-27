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
npm run lint               # JavaScript und Vue prüfen
npm run lint:fix           # Automatisch korrigierbare Regelverstöße beheben
npm test                   # Backendtests
npm run test:electron      # UI-Smoke-Test in der Electron-Laufzeit
```

ESLint prüft die aktuelle Anwendung einschließlich Server, Electron und Tests. `old/`, lokale Daten und Zugangsdaten sowie generierte Dateien sind ausgeschlossen. Die Formatregeln verwenden Tabs und doppelte Anführungszeichen; `npm run lint -- --fix` funktioniert ebenfalls. Nicht automatisch korrigierbare Probleme müssen anhand der ESLint-Meldungen behoben werden.

Falls eine npm-Konfiguration Installationsskripte blockiert und die Electron-Laufzeit fehlt: `node node_modules/electron/install.js` nachholen. Installer sind vorbereitet; plattformübergreifende Builds und Signierung benötigen die jeweiligen Toolchains/Zertifikate.

## Medien und Wiedergabe

Neue Bild-Uploads und URL-Downloads werden vor der endgültigen Speicherung in WebP konvertiert (Qualität 85). Bilderstapel einschließlich Google Photos werden proportional auf maximal 1600 Pixel an der langen Seite verkleinert; kleinere Bilder werden nicht vergrößert. Panoramen behalten ihre Abmessungen. Google Ambient liefert die konvertierten Bilder zur Anzeige ohne dauerhafte lokale Speicherung. HTML-Uploads bleiben HTML. Bereits vorhandene Medien werden nicht nachträglich konvertiert.

- **Bilderstapel:** ein eigener, horizontal und vertikal zentrierter Stapel pro Monitor. Jedes Bild einschließlich Rahmen belegt höchstens 30 % seiner Monitorfläche und behält sein Seitenverhältnis; alle zwölf Sekunden wechseln die Fotos synchron.
- **Scrollendes Panorama:** eine gemeinsame, bildschirmübergreifende Fläche mit vertikalem Scrollzyklus. Bilder mit ausreichender Höhe erlauben sichtbares Scrollen; breite Panoramen passen sich der Gesamtleinwand an.
- **Passendes Bild:** vollständiges Bild in der Gesamtleinwand, ohne Beschnitt, gegebenenfalls mit schwarzen Rändern.
- **HTML:** hochgeladene eigenständige HTML-Datei oder externe HTTP(S)-Seite in einem isolierten iframe. Externe Seiten können Einbettung selbst verbieten. Kein Zugriff auf Node oder Verwaltungs-API.
- **Google Photos · Ambient-Galerie:** Google-Alben und Sammlungen über die Ambient API als Bilderstapel. Anmeldung unter API-Einstellungen, Albumauswahl im Szeneneditor; automatische Aktualisierung der Fotos ohne dauerhafte Bildspeicherung.

- **Google Photos · Picker-Import:** bis zu 2000 manuell ausgewählte Fotos lokal importieren und als Bilderstapel anzeigen; funktioniert ohne Ambient-Partnerzulassung.

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

Alle Dienstoptionen der Tabelle werden unter **API-Einstellungen → Konfigurieren** in einem erklärten JSON-Editor gepflegt. Informationsmodule wählen nur die passende **API-Verbindung**; Zugangsdaten und Dienstoptionen stehen nicht mehr im Modul-Editor. Der alte schulabhängige HTML-Scraper wird nicht unverändert übernommen: für die konkrete Schulwebsite ist ein passender Adapter oder JSON-Endpunkt erforderlich. Kalender-OAuth, echte Netzwerkgeräte und externe Dienste müssen mit den eigenen Daten eingerichtet und geprüft werden. Es werden keine alten Passwörter/API-Schlüssel übernommen.

## Speicherung und Architektur

Webmodus: `data/` im Projekt. Electron: `app.getPath('userData')/data`. Mit `WALL_DATA_DIR` lässt sich ein gemeinsamer Speicherort setzen. `WALL_PORT` (Standard 3210) und `WALL_HOST` (Webmodus, Standard `0.0.0.0`) konfigurieren den Server. Desktop- und Webmodus nicht gleichzeitig auf demselben Port starten.

- `settings.json`: Szenen, Monitorgeometrie, Overlays, Wiedergabeeinstellungen und gemeinsame API-Verbindungen unter `apis`. Szenen und externe Informationsmodule verwenden `apiId` als Verweis.
- `secrets.json`: generierter Zugangscode und Dienstzugangsdaten unter `apis[apiId]`, nicht Bestandteil des Konfigurationsexports.
- `media/`: hochgeladene und über den Picker importierte Dateien mit zufälligen Dateinamen.

Keine Datenbank. JSON-Dateien werden über temporäre Dateien und Umbenennen geschrieben; Schreibvorgänge sind serialisiert. Beschädigte Einstellungen lösen einen Startfehler aus und werden nicht durch Defaults überschrieben. Zugangsdaten werden mit Dateimodus 0600 gespeichert, sind jedoch keine verschlüsselte Geheimnisablage. Für vollständige Sicherungen das Datenverzeichnis kopieren; der Export in der Verwaltung enthält nur Einstellungen und Medienreferenzen.

`server/` enthält Schema, Persistenz, zentralen Scheduler, Dienstadapter, HTTP-API und Server-Sent Events. Jede Wand und Fernsteuerung erhält denselben Zustand. Gleichzeitige Änderungen an Einstellungen werden anhand einer Revision abgewiesen. Wiedergabeposition/Pause sind Laufzeitzustand; nach Neustart beginnt die Auswahl neu. `electron/` verwaltet isolierte Fenster und reagiert auf Änderungen angeschlossener Displays. `src/` enthält die gemeinsame Vuetify-Oberfläche und den Renderer der virtuellen Leinwand.

Die Verwaltung nutzt HTTP im lokalen Netzwerk. Für Zugriff außerhalb eines vertrauenswürdigen LAN einen HTTPS-Reverse-Proxy oder VPN einsetzen. Den Server nicht ungeschützt ins Internet veröffentlichen. Electron verwendet Sandbox, Context Isolation und deaktivierte Node-Integration entsprechend der [Electron-Sicherheitsdokumentation](https://www.electronjs.org/docs/latest/tutorial/security).

## Altdaten

`old/data/fotos.js_example` enthält lediglich einen Beispiel-Eintrag; eigentliche Bildverzeichnisse und produktive Konfigurationen sind hier nicht vorhanden. Bilder über die Mediathek importieren. Die alten Typen entsprechen: `C` → Bilderstapel, `R` → scrollendes Panorama, `P` → passendes Bild, `I` → HTML. Layout und Add-on-Zuordnungen aus `old/data/data.js` dienen als Grundlage der vier virtuellen Standardmonitore.

## API-Einstellungen

Unter **API-Einstellungen** lassen sich benannte Verbindungen für Ambient, Picker, Kalender, Wetter, Bus/Bahn, Vertretungspläne, MPD, Kameras und Fußball anlegen. Mehrere Medien bzw. Informationsmodule können denselben Eintrag verwenden. Im Element bleiben nur Darstellungsoptionen (Titel, Monitor, Position, Intervall, Szenenfilter und Albumauswahl).

Dienstoptionen stehen in `settings.json`; Zugangsdaten, Google-Tokens und interne Geräte-/Picker-Sitzungszuordnungen ausschließlich in `secrets.json`. Gespeicherte Zugangsdaten werden nicht an das Frontend zurückgegeben. Beim Ändern der Zugangsdaten lässt `{}` bestehende Werte unverändert; leere Zeichenketten entfernen eine Angabe. Eine referenzierte API kann nicht gelöscht werden. Bestehende Widget-Konfigurationen und die bisherige Google-Verbindung werden beim Start automatisch migriert, einschließlich vorhandener Tokens und Ambient-Gerätebindungen. Das alte Projekt unter `old/` wird dabei nicht verändert.

## Google Photos · Picker-Import

1. Im Google-Cloud-Projekt die **Google Photos Picker API** aktivieren (nicht die allgemeine Google Picker API). Das verwendete Google-Konto im OAuth-Testmodus als Testnutzer hinzufügen. Einen OAuth-Client vom Typ **Desktop-App** verwenden; [Google beschreibt die Konfiguration](https://developers.google.com/photos/overview/configure-your-app).
2. Die Client-JSON als `config/client_secret_picker.json` ablegen, alternativ den Pfad über `WALL_GOOGLE_PICKER_OAUTH_FILE` setzen. Beim ersten Einrichten übernimmt die Picker-Verbindung diese Datei automatisch. Spätere Änderungen können unter **API-Einstellungen → Google Photos · Import → OAuth einrichten → OAuth-Datei aus config übernehmen** eingelesen oder manuell gespeichert werden.
3. Unter **API-Einstellungen → Google Photos · Import → Mit Google verbinden** die Anmeldung öffnen und bestätigen. Diese Anmeldung erfolgt im Browser auf dem Rechner, der die Bilderwand ausführt: Google leitet auf `http://127.0.0.1:<WALL_PORT>/oauth/google/callback` zurück. Der OAuth-Code wird mit PKCE und einem geprüften `state` eingelöst. Die bestehende Ambient-Freigabe wird nicht übernommen, weil Picker eine eigene Berechtigung benötigt. Die Client-Zugangsdaten der beiden APIs können daher unterschiedlich sein.
4. **Mediathek → Szene hinzufügen → Google Photos · Picker-Import** wählen, die gewünschte Picker-API auswählen und speichern.
5. **Fotos bei Google auswählen → Google-Fotoauswahl öffnen**. Nach dem Albumtitel suchen, Fotos markieren und bei Google bestätigen. Die Auswahl wird automatisch erkannt; anschließend **Ausgewählte Fotos importieren** wählen. Die Fotoauswahl darf auch auf einem Smartphone erfolgen, nachdem die Kontoanmeldung am Rechner abgeschlossen ist.

Der Stapel ist nach dem Import auch ohne Internet und nach einem Neustart verfügbar. Es werden JPEG, PNG, WebP, GIF und AVIF übernommen; Videos werden übersprungen. Maximal 2000 Fotos pro Auswahl, 50 MB pro Foto und 2 GB insgesamt. Der Import läuft im Backend weiter, wenn der Dialog geschlossen wird. Die neue Auswahl ersetzt die Quellen der Szene erst nach vollständigem Download. Bei einem Fehler bleibt der bisherige Stapel erhalten und temporäre Dateien werden entfernt. Neue Bilder im Google-Album werden nicht automatisch übernommen; dafür eine neue Auswahl starten. Bereits lokal importierte alte Bilddateien bleiben im Medienordner erhalten. Ein echter Kontotest erfordert die Picker-API-Aktivierung und die Nutzerfreigabe; die automatisierten Importtests verwenden simulierte Google-Antworten.

Die Sitzungen und Bildadressen bei Google sind zeitlich begrenzt. Deshalb werden die ausgewählten Fotos heruntergeladen und nicht als dauerhafte Cloud-Links gespeichert. [Picker-Ablauf](https://developers.google.com/photos/picker/guides/get-started-picker), [Sitzungsreferenz](https://developers.google.com/photos/picker/reference/rest/v1/sessions).

## Google Photos · Ambient-Galerien

**Voraussetzung: Aufnahme ins Google Photos Partnerprogramm.** Die hier verwendete Ambient API ist nur für zugelassene Partner verfügbar. API-Aktivierung, OAuth-Testnutzer und Kontofreigabe allein reichen nicht aus. Google beschreibt diese Zugangsvoraussetzung auf der [Partnerprogramm-Seite](https://developers.google.com/photos/partner-program/overview). Eine Ablehnung mit Verweis auf das Partnerprogramm lässt sich nicht durch erneutes Anmelden beheben. Der oben beschriebene Picker-Import steht als Alternative ohne Partnerzulassung zur Verfügung und ersetzt keine automatische Album-Synchronisierung.

1. In einem eigenen Google-Cloud-Projekt die **Google Photos Ambient API** aktivieren und den OAuth-Zustimmungsbildschirm einrichten. Bei einem Projekt im Testmodus das eigene Google-Konto als Testnutzer hinzufügen. Einen OAuth-Client vom Typ **TVs und Geräte mit begrenzter Eingabe** erstellen. Die Schrittfolge beschreibt [Google](https://developers.google.com/photos/ambient/guides/configure-your-app). Kalender- oder Desktop-OAuth-Clients sind dafür nicht geeignet.
2. **Mediathek → Szene hinzufügen → Google Photos · Ambient-Galerie** wählen, einen Titel und eine Ambient-API-Verbindung auswählen und speichern. Der Dialog bleibt für die Einrichtung offen.
3. Die heruntergeladene `client_secret_*.json` (alternativ `client_secret.json`) unter `config/` im Projekt ablegen und die Anwendung neu starten. Es darf dort nur eine Ambient-Client-Datei liegen; `client_secret_picker.json` wird bei der Ambient-Suche ausgeschlossen. Alternativ mit `WALL_GOOGLE_OAUTH_FILE` den Dateipfad angeben oder unter **API-Einstellungen → Google Photos · Ambient → OAuth einrichten** Client-ID und Client-Secret manuell speichern. Eine vorhandene Datei wird beim Start eingelesen und hat Vorrang vor manuell gespeicherten Zugangsdaten; ein Clientwechsel mit gebundenen Galerien wird verhindert. **Mit Google verbinden** bei der Ambient-API unter API-Einstellungen starten, die Google-Anmeldung öffnen und den angezeigten Code eingeben. Die Freigabe lässt sich auch auf einem Smartphone durchführen. Die Oberfläche prüft die Anmeldung automatisch.
4. **Galerie verbinden**, danach **Alben bei Google auswählen**. Bei Google die gewünschten Alben oder Sammlungen freigeben; anschließend **Galerie aktualisieren**.
5. Optional im Feld **Angezeigte Galerie** ein einzelnes freigegebenes Album wählen und die Szene speichern. Danach in der Mediathek **Anzeigen** starten.

Mit „Alle ausgewählten Sammlungen“ wird ein von Google zusammengestellter Stapel mit bis zu 100 Fotos angezeigt. Ein einzelnes Album wird paginiert mit bis zu 500 Fotos geladen. Googles Auswahl und Inhaltsfilter können beeinflussen, welche Bilder bereitgestellt werden; die [Ambient-API-Referenz](https://developers.google.com/photos/ambient/reference/rest/v1/mediaItems/list) beschreibt das Verhalten. Direkte öffentliche Freigabelinks werden nicht gescrapt. Die frühere Library API bietet keinen allgemeinen Zugriff auf bestehende oder geteilte Alben mehr; für die Bilderwand wird die aktuelle Ambient API verwendet.

Bildlisten werden alle 40 Minuten erneuert, vor Ablauf der Bildadressen. Vor der Albumauswahl wird entsprechend der Google-Pollingempfehlung gewartet. Manuelle Aktualisierungen sind begrenzt; das Backend beachtet das Limit von 240 Medienlistenaufrufen pro Galerie und Tag innerhalb seiner Laufzeit. Auf mehreren Monitoren erscheinen unterschiedliche Ausschnitte des gemeinsamen Bilderstapels. Die üblichen Szenenfilter, Prioritäten und Pausen gelten auch für Google-Galerien.

Google-Zugangsdaten und die Zuordnung der Google-Geräte zu Szenen liegen ausschließlich in `secrets.json`. Der Konfigurationsexport enthält Szenen und öffentliche API-Einstellungen, keine Tokens, dynamischen Cloud-Bildadressen oder Geräteschlüssel. Fotos werden durch einen authentifizierten Backend-Proxy geladen, ohne sie auf die Festplatte zu schreiben. Bei kurzzeitigen Ausfällen bleiben noch gültige Bildreferenzen erhalten; nach 50 Minuten werden sie von der Wiedergabe ausgeschlossen. Ohne Internet gibt es keinen dauerhaften Offline-Fotocache.

Vor dem Entfernen einer Szene oder dem Wechsel ihres Typs **Galerie trennen** wählen. Das entfernt ihre Google-Gerätezuordnung auch bei Google. Andere Google-Galerien bleiben verbunden. Nach Neustarts werden die gespeicherten Zuordnungen verwendet und die Bildlisten neu geladen. Ein Wechsel der OAuth-Client-ID erfordert vorher das Trennen aller Galerien.

Die Integration ist mit simulierten OAuth-/Ambient-Antworten und dem Electron-Renderer getestet. Ein echter Kontotest erfordert die eigene API-Freischaltung und OAuth-Zugangsdaten; Google kann bei Projekteinrichtung, Konto, Testmodus oder API-Zugriff zusätzliche Einschränkungen anzeigen.

Bei `invalid_client` / `Invalid client type` wurde ein ungeeigneter OAuth-Client verwendet: einen neuen Client vom Typ **TVs und Geräte mit begrenzter Eingabe** erstellen und die JSON-Datei ersetzen. Der Eintrag `installed` allein identifiziert den Clienttyp nicht eindeutig; Google prüft ihn bei der Anmeldung. Die Client-JSON wird durch `.gitignore` ausgeschlossen und nicht in die gebaute Anwendung aufgenommen. Bei einer installierten Anwendung den externen Dateipfad über `WALL_GOOGLE_OAUTH_FILE` setzen. Das Backend verwendet nur Client-ID und Client-Secret aus der Datei, keine darin enthaltenen URL-Endpunkte.
