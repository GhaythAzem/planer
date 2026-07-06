# 💍 Verlobungs-Planer – Anleitung

Ein gemeinsamer Planer für eure Verlobung: To-do-Liste, Gästeliste, Budget,
Countdown mit Terminen und Notizen. Alles auf Deutsch, arabische Eingaben
werden automatisch richtig (rechts nach links) dargestellt.

## Sofort ausprobieren (ohne Einrichtung)

Öffne einfach `index.html` im Browser. Die Daten werden dann **nur in diesem
Browser** gespeichert – zum Testen perfekt, aber deine Verlobte sieht deine
Änderungen noch nicht.

Damit ihr **beide dieselben Daten** seht und Änderungen sofort beim anderen
erscheinen, braucht ihr die zwei Schritte unten: **Firebase** (kostenloser
Cloud-Speicher, ca. 10 Minuten) und **GitHub Pages** (macht die Seite über
einen Link erreichbar).

---

## Schritt 1: Firebase einrichten (kostenlos)

Firebase ist ein kostenloser Dienst von Google, der eure Daten in der Cloud
speichert und in Echtzeit synchronisiert.

### 1.1 Projekt anlegen

1. Gehe zu **https://console.firebase.google.com** und melde dich mit einem
   Google-Konto an.
2. Klicke auf **„Projekt hinzufügen“** (Add project).
3. Gib einen Namen ein, z. B. `verlobungs-planer`, und klicke auf **Weiter**.
4. Google Analytics kannst du **deaktivieren** (wird nicht gebraucht).
5. Klicke auf **„Projekt erstellen“** und warte kurz.

### 1.2 Anonyme Anmeldung aktivieren

1. Klicke links im Menü auf **Build → Authentication**.
2. Klicke auf **„Jetzt starten“** (Get started).
3. Wähle unter „Sign-in method“ die Option **„Anonym“ (Anonymous)**,
   schalte sie **ein** und speichere.

> Dadurch braucht ihr **kein Konto und kein Passwort** – die Anmeldung
> passiert unsichtbar im Hintergrund.

### 1.3 Firestore-Datenbank anlegen

1. Klicke links im Menü auf **Build → Firestore Database**.
2. Klicke auf **„Datenbank erstellen“** (Create database).
3. Wähle einen Standort (z. B. `europe-west3` = Frankfurt) und **Weiter**.
4. Wähle **„Im Produktionsmodus starten“** und klicke auf **Erstellen**.

### 1.4 Sicherheitsregeln setzen

1. Öffne in Firestore den Reiter **„Regeln“ (Rules)**.
2. Ersetze den gesamten Inhalt durch:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /planners/{code} {
      allow read, write: if request.auth != null;
    }
  }
}
```

3. Klicke auf **„Veröffentlichen“ (Publish)**.

> Das bedeutet: Nur angemeldete Nutzer der App können lesen und schreiben.
> Euer Plan-Code (Schritt 3) wirkt zusätzlich wie ein gemeinsames Passwort –
> wählt also einen Code, den niemand leicht errät.

### 1.5 Web-App registrieren und Konfiguration kopieren

1. Klicke oben links auf das **Zahnrad ⚙️ → Projekteinstellungen**.
2. Scrolle zu **„Meine Apps“** und klicke auf das **Web-Symbol `</>`**.
3. Gib einen Namen ein (z. B. `planer`) und klicke auf **„App registrieren“**.
   „Firebase Hosting“ brauchst du **nicht** anhaken.
4. Dir wird ein Code-Schnipsel mit `const firebaseConfig = { ... }` angezeigt.
   Kopiere nur den Teil in den geschweiften Klammern `{ ... }`.

### 1.6 Konfiguration eintragen

Öffne die Datei **`firebase-config.js`** in diesem Projekt und ersetze
`null` durch deine Konfiguration:

```js
window.FIREBASE_CONFIG = {
  apiKey: "AIza...",
  authDomain: "verlobungs-planer.firebaseapp.com",
  projectId: "verlobungs-planer",
  storageBucket: "verlobungs-planer.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

Speichern – fertig! (Diese Werte sind kein Geheimnis; der Schutz kommt von
den Sicherheitsregeln aus Schritt 1.4.)

---

## Schritt 2: Seite über GitHub Pages veröffentlichen

Damit ihr beide die Seite einfach über einen Link öffnen könnt:

1. Stelle sicher, dass die geänderte `firebase-config.js` ins Repository
   gepusht ist (auf den Haupt-Branch, z. B. `main`).
2. Öffne dein Repository auf GitHub: `https://github.com/ghaythazem/planer`
3. Gehe zu **Settings → Pages**.
4. Wähle unter „Build and deployment“ → **Source: Deploy from a branch**,
   Branch: **`main`**, Ordner: **`/ (root)`** und klicke auf **Save**.
5. Nach 1–2 Minuten ist die Seite erreichbar unter:
   **https://ghaythazem.github.io/planer/**

Diesen Link schickst du deiner Verlobten. 💌

---

## Schritt 3: Gemeinsamen Plan-Code wählen

Beim ersten Öffnen fragt die Seite nach einem **Plan-Code**. Das ist euer
gemeinsamer Schlüssel:

- Denkt euch **einen** Code aus, z. B. `ghayth-amira-2026`.
- **Beide** gebt ihr auf euren Geräten **denselben Code** ein.
- Der Code wird pro Gerät gemerkt – ihr müsst ihn nur einmal eingeben.

Ab jetzt seht ihr beide dieselben Daten, und Änderungen erscheinen beim
anderen **sofort** (Echtzeit-Synchronisation). ✨

> **Tipp:** Wählt einen Code, den niemand erraten kann – er schützt eure
> Daten. Zum Zurücksetzen des Codes auf einem Gerät: Browser-Daten der Seite
> löschen (oder in der Konsole `localStorage.removeItem('verlobungsplaner-code')`).

---

## Funktionen im Überblick

| Bereich | Was ihr dort macht |
|---|---|
| ✅ **Aufgaben** | To-dos mit Kategorie anlegen, abhaken, löschen – mit Fortschrittsbalken |
| 👥 **Gäste** | Gäste mit Personenzahl erfassen; Status per Klick: offen → zugesagt → abgesagt |
| 💰 **Budget** | Posten mit geplanten und tatsächlichen Kosten; Summen und Differenz automatisch |
| ⏳ **Termine** | Verlobungsdatum festlegen (startet den Countdown) + weitere wichtige Termine |
| 📝 **Notizen** | Ideen, Links und Wünsche als Notizkarten festhalten |

**Arabisch:** Ihr könnt in jedes Feld auch auf Arabisch schreiben – die
Anzeige stellt sich automatisch auf Rechts-nach-links um (z. B. حفلة الخطوبة).
