# HiveVoice auf einem Raspberry Pi

Ein Raspberry Pi verbraucht wenige Watt und kann dauerhaft laufen: genug für eine HiveVoice für einen Verein, ein
Haus, eine Nachbarschaft oder eine Familie. Rund eine Stunde, das meiste davon Warten.

## Was du brauchst

- **Raspberry Pi 5 mit 8 GB** (ein Pi 4 mit 4 oder 8 GB geht auch, langsamer). Weniger als 4 GB reicht nicht.
- **Eine SSD** über USB oder NVMe (64 GB oder mehr). Eine SD-Karte geht zum Ausprobieren, nutzt sich aber bei einer
  Datenbank schnell ab.
- Netzteil, Netzwerkkabel (stabiler als WLAN), Gehäuse mit Lüfter.

## 1. System aufspielen

Mit dem **Raspberry Pi Imager** (raspberrypi.com/software) auf die SSD:

- Betriebssystem: **Raspberry Pi OS Lite (64-bit)**. 64 Bit ist Pflicht.
- Im Zahnrad: Hostname `hivevoice`, Benutzer und Passwort, **SSH an**.

Pi anschließen, einschalten, nach einer Minute vom eigenen Rechner aus:

```bash
ssh <benutzer>@hivevoice.local
```

## 2. Docker installieren

```bash
curl -fsSL https://get.docker.com | sh
```

```bash
sudo usermod -aG docker $USER && exit
```

Neu einloggen (`ssh …`), dann prüfen: `docker run --rm hello-world`.

## 3. HiveVoice einrichten

```bash
git clone https://github.com/dafiiit/HiveVoice.git
```

```bash
cd HiveVoice/selfhost && ./setup.sh --image ghcr.io/dafiiit/hivevoice:latest
```

Das fertige Image (`--image`) spart das Bauen der App, das auf dem Pi sonst lange dauert. Das Skript fragt:

1. **Wie andere ihn erreichen**: `local` (nur im WLAN), `tailscale` (von überall, ohne Router-Einstellungen,
   empfohlen), `cloudflare` oder `domain`. Für Tailscale: auf login.tailscale.com ein kostenloses Konto anlegen,
   unter Settings → Keys einen **Auth-Key** („Reusable“) erzeugen und unter Access controls Funnel erlauben
   (`"nodeAttrs": [{"target": ["autogroup:member"], "attr": ["funnel"]}]`).
2. **Deine E-Mail-Adresse** für die erste Admin-Person.

Am Ende steht die Adresse da, zum Beispiel `https://hivevoice.tail1234.ts.net`. Dort registrieren, fertig.

## 4. Dauerhaft betreiben

- **Neustart**: alle Dienste starten von selbst wieder (`restart: unless-stopped`).
- **Aktualisieren**: `cd HiveVoice && git pull && cd selfhost && ./setup.sh` (holt das neue Image, spielt neue
  Migrationen ein).
- **Sichern**: `./backup.sh` jede Nacht per cron auf eine zweite Platte oder einen anderen Rechner:

```bash
(crontab -l; echo "0 3 * * * cd $HOME/HiveVoice/selfhost && ./backup.sh && cp backups/*.tar.gz /mnt/sicherung/") | crontab -
```

- **Strom und Wärme**: Lüfter dran lassen; `vcgencmd measure_temp` sollte unter 70 °C bleiben.
- **Stand**: `./setup.sh --status`, Protokolle: `docker compose logs -f app`.

## Wenn etwas nicht geht

| Meldung | Abhilfe |
|---|---|
| `exec format error` | 32-Bit-System erwischt: Raspberry Pi OS **64-bit** neu aufspielen |
| Tailscale meldet sich nicht | Auth-Key abgelaufen oder nicht wiederverwendbar; Funnel in den Access controls erlauben |
| Seite lädt sehr langsam | SD-Karte statt SSD, oder zu wenig Speicher (`free -h`): mindestens 4 GB |
| Anmelden geht, aber Mails kommen nicht | ohne Mailserver gibt es keine Mails; Konten werden sofort bestätigt. SMTP in `selfhost/.env` eintragen (`docs/selbsthosting.md`) |
