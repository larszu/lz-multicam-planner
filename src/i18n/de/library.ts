/** DE-Overrides: Geraetebibliothek (Einstellungen, Einreichen, Herkunftszeile).
 *  Keys: library.*, settings.tab.*, sidebar.cam.* der Bibliothek */
export const library: Record<string, string> = {
  'settings.tab.general': 'Allgemein',
  'settings.tab.library': 'Gerätebibliothek',

  'library.intro':
    'Die gemeinsame Gerätebibliothek ergänzt den Katalog um Kameras und Objektive als schreibgeschützte Quelle und führt auch die eigenen Einträge. Sie braucht ein Konto.',
  'library.server': 'Server',
  'library.server.aria': 'Adresse des Gerätebibliothek-Servers',
  'library.server.apply': 'Übernehmen',
  'library.server.reset': 'Zurücksetzen',
  'library.server.invalid': 'Keine brauchbare Adresse. Sie muss mit https:// beginnen (http:// nur für localhost).',
  'library.server.custom':
    'Nicht der Standard-Server ({url}). Dieser Build erlaubt in seiner Content-Security-Policy nur den Standard; ein anderer Server muss dort eingetragen werden, sonst wird jede Anfrage blockiert.',
  'library.server.hint':
    'Ein Serverwechsel meldet ab: Konto und Geräte gehören zu einem Server. Jeder Server hat seinen eigenen Zwischenspeicher — wer zurückwechselt, hat den alten Stand wieder.',

  'library.account': 'Konto',
  'library.signedInAs': 'Angemeldet als {name} ({email}).',
  'library.signedInUnchecked': 'Angemeldet — der Server hat die Sitzung noch nicht bestätigt.',
  'library.token.session': 'Die Anmeldung gilt nur für diese Sitzung: kein sicherer Speicher verfügbar.',
  'library.token.keychain': 'Die Anmeldung liegt im Schlüsselbund des Systems.',
  'library.token.browser': 'Die Anmeldung liegt im lokalen Speicher dieses Browsers. Auf einem geteilten Rechner abmelden.',
  'library.signOut': 'Abmelden',
  'library.twoFactor.prompt': 'Den sechsstelligen Code aus der Authenticator-App eingeben.',
  'library.twoFactor.code': 'Code',
  'library.twoFactor.verify': 'Bestätigen',
  'library.cancel': 'Abbrechen',
  'library.close': 'Schließen',
  'library.login': 'E-Mail oder Benutzername',
  'library.password': 'Passwort',
  'library.signIn': 'Anmelden',
  'library.signingIn': 'Anmelden…',
  'library.register': 'Konto anlegen',
  'library.forgot': 'Passwort vergessen',

  'library.error.wrongCredentials': 'E-Mail/Benutzername oder Passwort ist falsch.',
  'library.error.emailNotVerified':
    'Die E-Mail-Adresse ist noch nicht bestätigt. Den Link aus der Bestätigungsmail öffnen, dann erneut anmelden.',
  'library.error.guidelinesOutdated':
    'Die Community-Richtlinien der Bibliothek haben sich geändert. Auf der Website neu annehmen, dann erneut versuchen.',
  'library.error.guidelinesOpen': 'Richtlinien öffnen',
  'library.error.exists':
    'Hersteller und Modell stehen schon in der Bibliothek. Den Eintrag dort öffnen und bestätigen oder korrigieren, statt ihn erneut einzureichen.',
  'library.error.wrongCode': 'Der Code ist falsch oder abgelaufen. Den aktuellen Code aus der Authenticator-App eingeben.',
  'library.error.rateLimited': 'Zu viele Versuche. Eine Minute warten und erneut versuchen.',
  'library.error.notSignedIn': 'Nicht angemeldet (oder die Sitzung ist abgelaufen). Bitte neu anmelden.',
  'library.error.offline':
    'Der Server ist nicht erreichbar. Die Geräte vom letzten Abgleich bleiben verfügbar. Verbindung prüfen — und bei einem anderen als dem Standard-Server, ob seine Adresse in der Content-Security-Policy dieses Builds steht.',
  'library.error.serverEmpty':
    'Der Server wurde neu aufgesetzt und hat noch keine Geräte. Die Geräte vom letzten Abgleich wurden behalten.',
  'library.error.server': 'Der Server hat mit einem Fehler geantwortet. Später erneut versuchen.',

  'library.sync': 'Abgleich',
  'library.sync.count': '{cameras} Kameras und {lenses} Objektive aus der Bibliothek im Katalog.',
  'library.sync.last':
    'Letzter Abgleich {at}: {added} neu, {updated} aktualisiert, {removed} entfernt, {invalid} als ungültig übersprungen.',
  'library.syncNow': 'Jetzt abgleichen',
  'library.syncing': 'Gleiche ab…',
  'library.sync.hint':
    '„Jetzt abgleichen“ lädt zuerst die eigenen Einträge hoch und holt dann die Aktualisierungen. Die App gleicht außerdem beim Start ab, solange eine Anmeldung besteht. Der Zwischenspeicher bleibt beim Abmelden erhalten, damit platzierte Bibliothekskameras offline weiter funktionieren.',
  'library.uploading': 'Lade hoch…',
  'library.autoUpload': 'Eigene Geräte automatisch hochladen',
  'library.autoUpload.hint':
    'Eigene und geänderte Kameras und Objektive gehen beim Start und wenige Sekunden nach jeder Änderung hoch; die Bibliothek ordnet sie über Hersteller und Modell zu.',
  'library.upload.summary':
    'Eigene Einträge: {live} live, {waiting} warten auf Moderation, {blocked} blockiert, {failed} fehlgeschlagen.',
  'library.upload.none': 'Noch nicht in der Gerätebibliothek.',
  'library.upload.changed': 'Seit dem letzten Hochladen geändert — geht beim nächsten Abgleich hoch.',
  'library.upload.created': 'Als neues Gerät hochgeladen — wartet auf Moderation.',
  'library.upload.editProposed': 'Als nächste Version eines vorhandenen Geräts hochgeladen — wartet auf Moderation.',
  'library.upload.pendingUpdated': 'Der wartende Upload wurde durch diese Fassung ersetzt.',
  'library.upload.approved': 'Live in der Gerätebibliothek.',
  'library.upload.inSyncPending': 'Hochgeladen — wartet noch auf Moderation.',
  'library.upload.inSync': 'Die Gerätebibliothek führt genau diesen Stand.',
  'library.upload.blocked': 'Von den Prüfungen der Bibliothek blockiert.',
  'library.upload.error': 'Hochladen fehlgeschlagen.',
  'library.upload.button': 'Hochladen…',
  'library.upload.buttonTitle': 'Diesen Eintrag jetzt in die gemeinsame Gerätebibliothek hochladen',
  'library.upload.title': 'In die Gerätebibliothek hochladen',
  'library.upload.submit': 'Hochladen',
  'library.upload.matchHint':
    'Führt die Bibliothek Hersteller und Modell schon, werden die eigenen Daten dessen nächste Version statt eines zweiten Geräts.',
  'library.finding.noSource': 'Datenblattlink fehlt',
  'library.finding.sourceNotLink': 'Datenblattlink ist kein Link',
  'library.finding.noManufacturer': 'Hersteller fehlt',
  'library.finding.noModel': 'Modell fehlt',
  'library.badge.carried': 'Eintrag der Gerätebibliothek aus der Projektdatei — nicht im eigenen Abgleich.',

  'library.status.verified': 'geprüft',
  'library.status.confirmed': 'bestätigt',
  'library.status.unconfirmed': 'unbestätigt',
  'library.status.disputed': 'strittig',
  'library.badge': 'Gerätebibliothek · {status} · {n} Bestätigungen',
  'library.badge.open': 'Ansehen',

  'library.propose.camera': 'Kamera „{name}“ mit Sensor, Mounts, Adaptern und Belegen.',
  'library.propose.lens': 'Objektiv „{name}“ mit Brennweitenbereich, Blende, Mount und Bildkreis.',
  'library.propose.open': 'In der Bibliothek öffnen',
  'library.propose.signInFirst': 'Hochladen braucht ein Konto bei der Gerätebibliothek. Zuerst anmelden.',
  'library.propose.goSignIn': 'Anmelden…',
  'library.propose.source': 'Link zum Datenblatt (Pflicht)',
  'library.propose.sourceInvalid': 'Einen vollständigen Link (https://…) zum Herstellerdatenblatt eingeben.',
  'library.propose.sending': 'Wird hochgeladen…',

  'sidebar.cam.libraryGroup': '── Gerätebibliothek ──',
  'sidebar.cam.tagLibrary': ' · Bibliothek',
};
