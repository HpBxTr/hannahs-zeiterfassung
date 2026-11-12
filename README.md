# Hannahs Zeiterfassung auf der eigenen Domain

Dieses Paket enthält die Next.js-Anwendung, eine SQLite-Datenbank für den eigenen Server und eine Docker-Compose-Konfiguration für HTTPS und Passwortschutz. SQLite legt die Datenbank beim ersten Datenabruf an. Das Paket startet mit einem leeren Zeitbuch. Daten aus der bisherigen ChatGPT-Site sind separat gespeichert. Dort lassen sich Tagesberichte per CSV herunterladen.

## Voraussetzungen

- Ein Server mit Docker und Docker Compose v2, zum Beispiel ein VPS.
- Eine Domain oder Subdomain, deren DNS du verwaltest. Die Beispiele verwenden `zeit.meine-domain.de`.
- Die TCP-Ports 80 und 443 sind am Server frei und von außen erreichbar.

## Installieren

1. Lege bei deinem DNS-Anbieter für die gewünschte Domain oder Subdomain einen A-Eintrag mit der öffentlichen IPv4-Adresse des Servers an. Verwende einen AAAA-Eintrag nur, wenn der Server auch unter der angegebenen IPv6-Adresse erreichbar ist.
2. Entpacke das ZIP auf dem Server und öffne das Projektverzeichnis.
3. Kopiere die Konfigurationsvorlage und erstelle einen Passwort-Hash. Der zweite Befehl fragt nach dem Passwort.

   ```sh
   cp .env.example .env
   docker run --rm -it caddy:2-alpine caddy hash-password
   ```

4. Setze in `.env` deine Domain ohne `https://`, deinen Benutzernamen und den eben ausgegebenen Hash. Lass den Hash in **einfachen Anführungszeichen**, damit Compose die Dollarzeichen unverändert übernimmt.

   ```dotenv
   APP_DOMAIN=zeit.meine-domain.de
   ZEITBUCH_USER=hannah
   ZEITBUCH_PASSWORD_HASH='hier-den-vollständigen-Hash-einsetzen'
   ```

5. Baue und starte die Anwendung.

   ```sh
   docker compose up -d --build
   docker compose logs -f caddy
   ```

   Sobald DNS und Ports erreichbar sind, holt Caddy automatisch das HTTPS-Zertifikat. Öffne deine Domain mit `https://` und verwende beim Anmelden dein ursprüngliches Passwort. Der Passwortschutz gilt für die Seite und die Datenschnittstelle. Der Next.js-Port bleibt im Docker-Netz.

## Daten sichern und aktualisieren

Die SQLite-Datenbank liegt im Docker-Volume `zeitbuch_data`. Starte die Container aus demselben Projektverzeichnis, damit Compose dasselbe Volume verwendet. `docker compose down -v` löscht das Datenvolume.

Nach dem ersten Aufruf der App kannst du eine konsistente Sicherung erstellen, während sie läuft. Der folgende Befehl schreibt eine SQLite-Datei auf den Host.

```sh
mkdir -p backups
(umask 077; docker compose exec -T app node scripts/backup.mjs > "backups/zeitbuch-$(date +%F-%H%M%S).sqlite")
```

Behalte bei einem Update deine `.env` und das Datenvolume und führe erneut `docker compose up -d --build` aus.

## Mit bestehendem Reverse-Proxy

Auf einem Server mit Node.js 24 oder neuer kannst du auch `npm ci`, `npm run build` und `npm start` ausführen. Die App lauscht auf `127.0.0.1:3000`. Richte im vorhandenen Reverse-Proxy HTTPS und einen Zugriffsschutz für alle Pfade ein. Standardmäßig liegt die Datenbank in `data/zeitbuch.sqlite`. Setze `DATABASE_PATH` auf einen absoluten Pfad zu einem dauerhaft beschreibbaren Speicher, wenn du das Anwendungsverzeichnis bei Updates ersetzt.

[Next.js selbst hosten](https://nextjs.org/docs/pages/building-your-application/deploying) · [Caddy und HTTPS](https://caddyserver.com/docs/automatic-https) · [Caddy-Passwortschutz](https://caddyserver.com/docs/caddyfile/directives/basic_auth)
