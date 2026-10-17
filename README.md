# Orbit · Among Us Profile Manager

Windows-Desktop-App mit Electron, Angular 21 und SCSS. Profile verwalten Namen, Installationsordner und Auth-Plattform. Pro Plattform wird ein eigener Originalordner hinterlegt. Profildaten liegen in `%APPDATA%/amongus-profile-manager/profiles.json`.

## Starten

Node.js 22.12 oder neuer installieren, dann:

```powershell
npm install
npm start
```

## Entwicklungsumgebung

```powershell
npm run dev
```

Startet den Angular-Dev-Server und anschließend die echte Electron-App mit geöffneten DevTools. Änderungen an Angular-Templates, TypeScript und SCSS werden automatisch übernommen (HMR bzw. Neuladen). Source Maps sind aktiviert. Änderungen in `electron/` erfordern einen Neustart von `npm run dev`. Electron schließen oder Strg+C beendet auch den Dev-Server.

Dev-Profile liegen separat unter `%APPDATA%/orbit-development`, damit sie von installierten Profilen getrennt bleiben. Der Electron-Main-Prozess ist unter `127.0.0.1:9229` für einen Node-Debugger erreichbar. `npm run debug` ist ein Alias für `npm run dev`.

`npm run dev:web` startet nur die Browser-Vorschau auf `http://127.0.0.1:4200`; Dateioperationen benötigen Electron. `npm test` prüft Kopieren, Überschreibschutz, Eingabevalidierung und GitHub-Konfiguration.

## EXE mit GitHub-Download bauen

In `release.config.json` die **öffentliche Repository-URL** eintragen:

```json
{ "repositoryUrl": "https://github.com/dein-name/dein-repository" }
```

```powershell
npm run dist
```

Erzeugt unter `release/` den kleinen `Orbit-Web-Setup-1.0.0.exe` sowie das zugehörige `.7z`-App-Paket. **Alle `.exe`, `.7z` und `.yml`-Release-Dateien gemeinsam** in einem veröffentlichten GitHub Release mit Tag `v1.0.0` hochladen. Die EXE lädt bei der Installation das passende App-Paket aus genau diesem Release herunter und prüft dessen Prüfsumme. Der Tag muss immer `v` plus `package.json`-Version entsprechen. Die Konfigurationsdatei wird beim Bauen ausgewertet; bei einer URL-Änderung muss die EXE neu gebaut werden.

Alternativ erzeugt `npm run dist:offline` einen vollständigen Installer ohne GitHub-Konfiguration. Die Installer sind ohne eigenes Zertifikat unsigniert.

Der mitgelieferte GitHub-Workflow baut und veröffentlicht bei einem `v*`-Tag automatisch. Dafür muss `repositoryUrl` auf dasselbe Repository zeigen; `package-lock.json` mit einchecken. Der Workflow verwendet ausschließlich den von GitHub bereitgestellten `GITHUB_TOKEN`.

## Profile und Authentifizierung

1. Unter **Plattformen** für Steam und/oder Epic den eigenen Originalordner mit `Among Us.exe` auswählen und speichern.
2. Profil erstellen, Plattform und Profilordner festlegen und speichern.
3. Profil erneut bearbeiten und bei Bedarf **Originaldateien kopieren**. Das Ziel muss leer sein. Originale werden nicht verändert, vorhandene Dateien nicht überschrieben. Ein fehlgeschlagener Kopiervorgang kann Teilkopien hinterlassen; diese vor einem erneuten Versuch manuell entfernen.
4. Profil starten.

**Steam:** Orbit öffnet den Steam-Client und startet die EXE des Profils mit Steam-App-ID 945360. Steam muss angemeldet sein und das Spiel besitzen. Ob eine konkrete modifizierte Spielversion korrekt authentifiziert, hängt von Spiel und Mods ab.

**Epic Games:** Aus einer vom Epic Launcher erzeugten Desktop-Verknüpfung die `com.epicgames.launcher://apps/…?action=launch&silent=true`-URL übernehmen und unter Plattformen speichern. Epic stellt beim Start dynamische Authentifizierungsparameter bereit; Orbit übergibt deshalb den Start an den Launcher. Dieser startet seinen registrierten Originalordner. Für einen Start muss der Epic-Profilordner mit diesem übereinstimmen. Separate Epic-Kopien werden nicht als authentifiziert startbar ausgegeben. Orbit verwaltet keine Zugangsdaten und umgeht keinen Kopierschutz.

Das Entfernen eines Profils löscht ausschließlich dessen Konfiguration. Der Download-Installer lädt die Manager-App. Mod-Downloads erfolgen separat auf Wunsch unter **Mods & BepInEx verwalten**.

## Mods installieren

Nach dem Einrichten eines Profilordners auf der Profilkarte **Mods & BepInEx verwalten** öffnen. Bei einem Mod die gewünschte **Mod-Version** auswählen, **Installation vorbereiten** anklicken, den Plan mit allen Abhängigkeiten prüfen und **Jetzt installieren** anklicken. Auch ältere Mod-Versionen können so gezielt installiert werden. Alle Mitspieler sollten denselben Mod-Versionsstand wählen. Das Spiel vorher schließen. BepInEx, Reactor und All The Roles sind als Beispiele enthalten. ATR 0.14.1 benötigt Among Us **17.4.0**, ATR 0.14.0 benötigt **17.3.0**; Orbit zeigt das an und ändert die Spielversion nicht. Für verschiedene große Rollen-Mods separate Profile verwenden.

Fehlt `Among Us.exe` im Profilordner, zeigt der Mod-Dialog einen Einrichtungsbereich an. Mit **Originaldateien ins Profil kopieren** wird der leere Profilordner aus dem unter **Plattformen** gespeicherten Originalordner eingerichtet. Danach wird die Mod-Installation freigeschaltet. Existiert das Spiel bereits in einem anderen Ordner, stattdessen den Installationspfad im Profil korrigieren.

Orbit erkennt x86/x64 aus der tatsächlichen `Among Us.exe`. DLLs kommen nach `BepInEx/plugins/`. ZIPs werden anhand ihrer `extract`-Liste selektiv entpackt. BepInEx ist auf die von ATR mitgelieferte Version 735 festgelegt. ATR veröffentlicht seine DLLs aktuell innerhalb eines ZIPs, deshalb enthält dieser Katalogeintrag eine ZIP-URL mit den zwei benötigten Plugin-Dateien. Reactor demonstriert den direkten DLL-Download.

**Las Monjas 4.0.1** ist ebenfalls enthalten und unterstützt laut [offiziellem Release](https://github.com/KiraYamato94/LasMonjas/releases/tag/4.0.1) Among Us **19.0.0 / 2026.9.29**, mit demselben Build für Steam und Epic. Der Eintrag verwendet das komplette, per SHA256 geprüfte x64-Paket des Autors inklusive BepInEx, Reactor, RegionInstall, Konfiguration und Runtime-/Interop-Dateien. Deshalb hat der Eintrag keine zusätzlichen Katalog-Abhängigkeiten. Das Paket ist für x86-Installationen nicht verfügbar. Verwende ein eigenes sauberes Profil, damit ATR oder andere Rollen-Mods nicht parallel geladen werden.

Vorhandene Zieldateien werden vor dem Ersetzen unter `%APPDATA%/orbit-development/mod-backups/<id>/` (Dev) bzw. im App-Datenordner der installierten App gesichert. `installation.json` beschreibt Originalpfad und geänderte Dateien. Bei Schreibfehlern erfolgt eine automatische Wiederherstellung. Es gibt derzeit keinen automatischen Deinstallationsknopf; Sicherungen können bei geschlossenem Spiel manuell zurückkopiert werden. Der Status prüft Dateihashes und kennzeichnet veränderte/fehlende Dateien. Ein erfolgreicher Installationsstatus bestätigt Dateiintegrität, nicht die Laufzeitkompatibilität mit jeder Spiel-/Mod-Version.

Beim Versionswechsel werden nicht mehr benötigte Dateien der bisherigen Version ebenfalls gesichert und entfernt, damit keine alte Plugin-DLL parallel geladen wird. Wurden solche alten Dateien zwischenzeitlich manuell verändert, bricht Orbit ab und nennt die betreffende Datei. Vorhandene, weiterhin benötigte Dateien werden wie bei einer normalen Neuinstallation gesichert und ersetzt.

## mods.json: lokaler und GitHub-Katalog

Die Datei **`mods.json` im Projektstamm** definiert den Katalog. Im Dev-Modus und bei `npm start` wird ausschließlich diese lokale Datei gelesen, selbst wenn eine GitHub-URL konfiguriert ist. **Neu laden** im Mod-Dialog übernimmt lokale Änderungen, ohne Electron neu zu starten. Die Mod-Binärdateien werden auch im Dev-Modus erst bei einer Installation von den eingetragenen URLs geladen.

Für veröffentlichte Builds in `release.config.json` eintragen:

```json
{
  "repositoryUrl": "https://github.com/dein-name/dein-repository",
  "modsUrl": "https://raw.githubusercontent.com/dein-name/dein-repository/main/mods.json"
}
```

Danach die EXE neu bauen. Die gepackte App ruft den Katalog beim Öffnen oder Neuladen des Mod-Dialogs von GitHub ab. Katalogänderungen benötigen danach keinen App-Neubuild. Wenn `modsUrl` leer ist, verwendet die gepackte App den mitgelieferten lokalen Katalog. Bei einer konfigurierten, aber fehlerhaften Onlinequelle wird der Fehler angezeigt; es erfolgt kein stiller Wechsel zu veralteten Einträgen.

Zusätzlicher Mod-Eintrag innerhalb des `mods`-Arrays (Beispiel-URLs ersetzen):

```json
{
  "id": "mein-mod",
  "name": "Mein Mod",
  "description": "Ein Mod mit mehreren auswählbaren Versionen.",
  "versions": [
    {
      "version": "1.1.0",
      "gameVersion": "17.4.0",
      "dependencies": [{ "id": "reactor", "version": "2.5.1" }],
      "downloads": {
        "any": {
          "url": "https://github.com/OWNER/REPO/releases/download/v1.1.0/MeinMod.dll",
          "format": "dll",
          "fileName": "MeinMod.dll"
        }
      }
    },
    {
      "version": "1.0.0",
      "gameVersion": "17.3.0",
      "dependencies": [{ "id": "reactor", "version": "2.5.0" }],
      "downloads": {
        "any": {
          "url": "https://github.com/OWNER/REPO/releases/download/v1.0.0/MeinMod.dll",
          "format": "dll",
          "fileName": "MeinMod.dll"
        }
      }
    }
  ]
}
```

`versions` enthält alle auswählbaren Mod-Versionen, der erste Eintrag ist die Vorauswahl. Jede Version hat eigene `dependencies` und `downloads`, optional `gameVersion` und eine abweichende `description`. `downloads` unterstützt `any` oder architekturspezifische `x86`/`x64`-Einträge. Abhängigkeiten mit `{ "id": "reactor", "version": "2.5.1" }` fixieren exakt die benötigte Version; ein einfacher String wie `"reactor"` wählt die erste Katalogversion. Abhängigkeiten werden transitiv vor dem Mod installiert, jede nur einmal. Fehlende IDs/Versionen, Zyklen und Versionskonflikte innerhalb eines Installationsplans werden vor einem Download abgewiesen. Verschiedene installierte große Rollen-Mods werden nicht automatisch miteinander auf Kompatibilität geprüft. Die ursprüngliche Kurzform mit `version`, `dependencies` und `downloads` direkt am Mod bleibt als einzelne Version lesbar.

Optional mit `sha256` einen 64-stelligen SHA256-Hash pro Download hinterlegen. Für ZIPs `format: "zip"` und `extract: ["BepInEx/plugins/MeinMod.dll"]` angeben. Einträge mit abschließendem `/` wählen ein ganzes Unterverzeichnis. Erlaubte Ziele sind `BepInEx/`, `dotnet/` und die Loader-Dateien `winhttp.dll`, `doorstop_config.ini`, `.doorstop_version`.

Liegt der Inhalt eines ZIPs in einem zusätzlichen Ordner, kann der Download `archiveRoot` enthalten, z. B. `"archiveRoot": "Las Monjas 4.0.1/"`. Nur dieser explizite Präfix wird entfernt. Die `extract`-Pfade beziehen sich dann auf den Inhalt darunter, sodass `BepInEx/` direkt neben `Among Us.exe` landet.

Quellen der mitgelieferten Einträge: [ATR](https://github.com/Zeo666/AllTheRoles), [Reactor](https://github.com/NuclearPowered/Reactor), [BepInEx-Builds](https://builds.bepinex.dev/projects/bepinex_be). Verwende eine eigene vertrauenswürdige GitHub-Quelle für den Katalog.
