// -----------------------------------------------------------------------------
// Texts sent from the container (feature names, action messages, widget
// contents, scene outputs), in the four languages of the Gladys interface.
// Entries are strings or functions of one parameter object. German says "du",
// Spanish "usted". Brand, line and place names never translate; the reasons
// of the disruptions come from TfL in English only.
// -----------------------------------------------------------------------------

export const INIT_FAILED = {
  en: 'Initialisation failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

// Feature names (frozen when the device is created, in the configured language).
export const NAMES = {
  en: {
    status: 'Status',
    level: 'Disruption level',
    disruption: 'Disruption',
    reason: 'Reason',
    next: 'Next arrival',
    following: 'Following arrival',
    line: 'Line and destination',
  },
  fr: {
    status: 'État',
    level: 'Niveau de perturbation',
    disruption: 'Perturbation',
    reason: 'Motif',
    next: 'Prochain passage',
    following: 'Passage suivant',
    line: 'Ligne et destination',
  },
  de: {
    status: 'Status',
    level: 'Störungsstufe',
    disruption: 'Störung',
    reason: 'Grund',
    next: 'Nächste Ankunft',
    following: 'Übernächste Ankunft',
    line: 'Linie und Ziel',
  },
  es: {
    status: 'Estado',
    level: 'Nivel de incidencia',
    disruption: 'Incidencia',
    reason: 'Motivo',
    next: 'Próxima llegada',
    following: 'Llegada siguiente',
    line: 'Línea y destino',
  },
};

// TfL modes (modeName of the API).
export const MODES = {
  en: {
    tube: 'Tube',
    overground: 'Overground',
    dlr: 'DLR',
    'elizabeth-line': 'Elizabeth line',
    tram: 'Tram',
    bus: 'Bus',
  },
  fr: {
    tube: 'Métro',
    overground: 'Overground',
    dlr: 'DLR',
    'elizabeth-line': 'Elizabeth line',
    tram: 'Tram',
    bus: 'Bus',
  },
  de: {
    tube: 'U-Bahn',
    overground: 'Overground',
    dlr: 'DLR',
    'elizabeth-line': 'Elizabeth line',
    tram: 'Tram',
    bus: 'Bus',
  },
  es: {
    tube: 'Metro',
    overground: 'Overground',
    dlr: 'DLR',
    'elizabeth-line': 'Elizabeth line',
    tram: 'Tranvía',
    bus: 'Autobús',
  },
};

// Disruption levels (src/transit.js).
export const LEVEL_NAMES = {
  en: ['Good service', 'Minor disruption', 'Severe disruption', 'Suspended or closed'],
  fr: ['Trafic normal', 'Perturbation mineure', 'Perturbation importante', 'Interrompue ou fermée'],
  de: ['Normaler Betrieb', 'Leichte Störung', 'Schwere Störung', 'Eingestellt oder gesperrt'],
  es: ['Servicio normal', 'Incidencia leve', 'Incidencia grave', 'Suspendida o cerrada'],
};

// TfL statusSeverity codes 0 to 20 (`/Line/Meta/Severity`).
export const SEVERITIES = {
  en: [
    'Special service',
    'Closed',
    'Suspended',
    'Part suspended',
    'Planned closure',
    'Part closure',
    'Severe delays',
    'Reduced service',
    'Bus service',
    'Minor delays',
    'Good service',
    'Part closed',
    'Exit only',
    'No step-free access',
    'Change of frequency',
    'Diverted',
    'Not running',
    'Issues reported',
    'No issues',
    'Information',
    'Service closed',
  ],
  fr: [
    'Service spécial',
    'Fermée',
    'Interrompue',
    'Partiellement interrompue',
    'Fermeture prévue',
    'Fermeture partielle',
    'Retards importants',
    'Service réduit',
    'Bus de remplacement',
    'Retards légers',
    'Trafic normal',
    'Partiellement fermée',
    'Sortie uniquement',
    'Pas d’accès de plain-pied',
    'Fréquence modifiée',
    'Déviée',
    'Ne circule pas',
    'Incidents signalés',
    'Aucun incident',
    'Information',
    'Service terminé',
  ],
  de: [
    'Sonderverkehr',
    'Gesperrt',
    'Eingestellt',
    'Teilweise eingestellt',
    'Geplante Sperrung',
    'Teilsperrung',
    'Große Verspätungen',
    'Eingeschränkter Betrieb',
    'Ersatzverkehr mit Bussen',
    'Leichte Verspätungen',
    'Normaler Betrieb',
    'Teilweise gesperrt',
    'Nur Ausstieg',
    'Kein stufenloser Zugang',
    'Geänderter Takt',
    'Umgeleitet',
    'Kein Betrieb',
    'Probleme gemeldet',
    'Keine Probleme',
    'Information',
    'Betriebsschluss',
  ],
  es: [
    'Servicio especial',
    'Cerrada',
    'Suspendida',
    'Suspendida en parte',
    'Cierre programado',
    'Cierre parcial',
    'Retrasos importantes',
    'Servicio reducido',
    'Autobús sustitutorio',
    'Retrasos leves',
    'Servicio normal',
    'Cerrada en parte',
    'Solo salida',
    'Sin acceso sin escalones',
    'Cambio de frecuencia',
    'Desviada',
    'Sin servicio',
    'Incidencias notificadas',
    'Sin incidencias',
    'Información',
    'Servicio terminado',
  ],
};

export const TEXT = {
  en: {
    searchNeedText: 'Type a stop or station name, e.g. Oxford Circus.',
    searchNone: ({ query }) => `No stop matches “${query}”.`,
    searchFound: ({ count }) => `${count} stop(s) found:`,
    searchHint: 'Add one with “Add a stop”, by name or by the identifier in brackets.',
    serviceDown: ({ error }) => `TfL cannot be reached (${error}). Try again in a moment.`,
    addUnknown: ({ query }) => `No stop “${query}” at TfL. Find it first with “Find a stop”.`,
    addAmbiguous: 'Several stops match: add one by its identifier.',
    addNoArrivals: ({ query }) =>
      `“${query}” has no TfL arrivals (National Rail only?). Pick another stop.`,
    addUnknownLines: ({ lines, available }) =>
      `Line(s) not serving this stop: ${lines}. Lines served: ${available}.`,
    added: ({ name }) => `${name} added.\nOpen the Discover tab to create its device.`,
    alreadyWatched: ({ name }) => `${name} is already watched with these filters.`,
    tooMany: ({ max }) => `You already watch ${max} stops: remove one first.`,
    removeUnknown: ({ query }) => `No watched stop is called “${query}”.`,
    removeAmbiguous: 'Several watched stops match: type the full name shown in the status.',
    removed: ({ name }) => `${name} removed. Delete its device in Gladys if you no longer need it.`,
    lineNeedText: 'Type a line name or number, e.g. Victoria, Elizabeth line, 73.',
    lineUnknown: ({ query }) => `No TfL line “${query}”.`,
    lineAdded: ({ name }) => `${name} followed.\nOpen the Discover tab to create its device.`,
    lineAlready: ({ name }) => `${name} is already followed.`,
    tooManyLines: ({ max }) => `You already follow ${max} lines: remove one first.`,
    lineNotFollowed: ({ query }) => `No followed line is called “${query}”.`,
    lineRemoved: ({ name }) =>
      `${name} no longer followed. Delete its device in Gladys if you no longer need it.`,
    statusNone: 'No line followed and no stop watched yet.',
    statusLines: ({ count }) => `${count} line(s) followed:`,
    statusStops: ({ count }) => `${count} stop(s) watched:`,
    statusCreated: 'device created',
    statusNotCreated: 'device not created yet (Discover tab)',
    statusRefreshed: ({ age }) => `Last read ${age} s ago.`,
    statusNeverRefreshed: 'Not read yet (no device created).',
    statusError: ({ error }) => `Last error: ${error}.`,
    statusKey: 'TfL app key: set.',
    statusNoKey: 'TfL app key: none (anonymous quota).',
    noArrival: 'No arrival announced',
    noDisruption: 'No disruption',
    pickStop: 'Pick a stop in the widget settings.',
    gone: 'This stop or line is no longer watched.',
    loading: 'Reading TfL…',
    legend: 'Live TfL predictions, minutes to wait.',
    linesHeading: 'TfL line status',
    noLines: 'Follow a line with the “Follow a line” action, then create its device.',
    allGood: 'Good service on every followed line.',
    unavailable: 'TfL has not answered yet: try again in a minute.',
    nothingAt: ({ stop }) => `No arrival announced at ${stop}.`,
    now: 'now',
    in: ({ minutes }) => `in ${minutes} min`,
    inTwo: ({ first, second }) => `in ${first} and ${second} min`,
    nowThen: ({ second }) => `now, then in ${second} min`,
    sentence: ({ line, destination, stop, when }) =>
      `${line} to ${destination} at ${stop}: ${when}`,
    lineSentence: ({ line, status }) => `${line}: ${status}`,
  },
  fr: {
    searchNeedText: "Saisissez un nom d'arrêt ou de station, par ex. Oxford Circus.",
    searchNone: ({ query }) => `Aucun arrêt ne correspond à « ${query} ».`,
    searchFound: ({ count }) => `${count} arrêt(s) trouvé(s) :`,
    searchHint:
      "Ajoutez-en un avec « Ajouter un arrêt », par son nom ou par l'identifiant entre crochets.",
    serviceDown: ({ error }) => `TfL est injoignable (${error}). Réessayez dans un instant.`,
    addUnknown: ({ query }) =>
      `TfL ne connaît aucun arrêt « ${query} ». Cherchez-le d'abord avec « Chercher un arrêt ».`,
    addAmbiguous: 'Plusieurs arrêts correspondent : ajoutez-en un par son identifiant.',
    addNoArrivals: ({ query }) =>
      `« ${query} » n'a pas de passages TfL (National Rail seulement ?). Choisissez un autre arrêt.`,
    addUnknownLines: ({ lines, available }) =>
      `Ligne(s) absente(s) de cet arrêt : ${lines}. Lignes desservies : ${available}.`,
    added: ({ name }) => `${name} ajouté.\nOuvrez l'onglet Découverte pour créer son appareil.`,
    alreadyWatched: ({ name }) => `${name} est déjà suivi avec ces filtres.`,
    tooMany: ({ max }) => `Vous suivez déjà ${max} arrêts : retirez-en un d'abord.`,
    removeUnknown: ({ query }) => `Aucun arrêt suivi ne s'appelle « ${query} ».`,
    removeAmbiguous:
      "Plusieurs arrêts suivis correspondent : saisissez le nom complet affiché dans l'état.",
    removed: ({ name }) =>
      `${name} retiré. Supprimez son appareil dans Gladys s'il ne vous sert plus.`,
    lineNeedText: 'Saisissez un nom ou un numéro de ligne, par ex. Victoria, Elizabeth line, 73.',
    lineUnknown: ({ query }) => `TfL n'a aucune ligne « ${query} ».`,
    lineAdded: ({ name }) => `${name} suivie.\nOuvrez l'onglet Découverte pour créer son appareil.`,
    lineAlready: ({ name }) => `${name} est déjà suivie.`,
    tooManyLines: ({ max }) => `Vous suivez déjà ${max} lignes : retirez-en une d'abord.`,
    lineNotFollowed: ({ query }) => `Aucune ligne suivie ne s'appelle « ${query} ».`,
    lineRemoved: ({ name }) =>
      `${name} n'est plus suivie. Supprimez son appareil dans Gladys s'il ne vous sert plus.`,
    statusNone: 'Aucune ligne ni aucun arrêt suivi pour le moment.',
    statusLines: ({ count }) => `${count} ligne(s) suivie(s) :`,
    statusStops: ({ count }) => `${count} arrêt(s) suivi(s) :`,
    statusCreated: 'appareil créé',
    statusNotCreated: 'appareil pas encore créé (onglet Découverte)',
    statusRefreshed: ({ age }) => `Dernière lecture il y a ${age} s.`,
    statusNeverRefreshed: 'Pas encore lu (aucun appareil créé).',
    statusError: ({ error }) => `Dernière erreur : ${error}.`,
    statusKey: 'Clé TfL : renseignée.',
    statusNoKey: 'Clé TfL : aucune (quota anonyme).',
    noArrival: 'Aucun passage annoncé',
    noDisruption: 'Aucune perturbation',
    pickStop: 'Choisissez un arrêt dans les réglages du widget.',
    gone: "Cet arrêt ou cette ligne n'est plus suivi.",
    loading: 'Lecture de TfL…',
    legend: "Prévisions TfL en temps réel, minutes d'attente.",
    linesHeading: 'État des lignes TfL',
    noLines: "Suivez une ligne avec l'action « Suivre une ligne », puis créez son appareil.",
    allGood: 'Trafic normal sur toutes les lignes suivies.',
    unavailable: "TfL n'a pas encore répondu : réessayez dans une minute.",
    nothingAt: ({ stop }) => `Aucun passage annoncé à ${stop}.`,
    now: 'maintenant',
    in: ({ minutes }) => `dans ${minutes} min`,
    inTwo: ({ first, second }) => `dans ${first} et ${second} min`,
    nowThen: ({ second }) => `maintenant, puis dans ${second} min`,
    sentence: ({ line, destination, stop, when }) =>
      `${line} vers ${destination} à ${stop} : ${when}`,
    lineSentence: ({ line, status }) => `${line} : ${status}`,
  },
  de: {
    searchNeedText: 'Gib den Namen einer Haltestelle oder Station ein, z. B. Oxford Circus.',
    searchNone: ({ query }) => `Keine Haltestelle passt zu „${query}“.`,
    searchFound: ({ count }) => `${count} Haltestelle(n) gefunden:`,
    searchHint:
      'Füge eine mit „Haltestelle hinzufügen“ hinzu, per Name oder Kennung in eckigen Klammern.',
    serviceDown: ({ error }) =>
      `TfL ist nicht erreichbar (${error}). Versuche es gleich noch einmal.`,
    addUnknown: ({ query }) =>
      `TfL kennt keine Haltestelle „${query}“. Suche sie zuerst mit „Haltestelle suchen“.`,
    addAmbiguous: 'Mehrere Haltestellen passen: füge eine über ihre Kennung hinzu.',
    addNoArrivals: ({ query }) =>
      `„${query}“ hat keine TfL-Ankünfte (nur National Rail?). Wähle eine andere Haltestelle.`,
    addUnknownLines: ({ lines, available }) =>
      `Linie(n), die hier nicht halten: ${lines}. Linien an dieser Haltestelle: ${available}.`,
    added: ({ name }) => `${name} hinzugefügt.\nÖffne den Tab „Entdecken“, um das Gerät anzulegen.`,
    alreadyWatched: ({ name }) => `${name} wird mit diesen Filtern bereits verfolgt.`,
    tooMany: ({ max }) => `Du verfolgst bereits ${max} Haltestellen: entferne zuerst eine.`,
    removeUnknown: ({ query }) => `Keine verfolgte Haltestelle heißt „${query}“.`,
    removeAmbiguous:
      'Mehrere verfolgte Haltestellen passen: gib den vollen Namen aus dem Status ein.',
    removed: ({ name }) =>
      `${name} entfernt. Lösche das Gerät in Gladys, wenn du es nicht mehr brauchst.`,
    lineNeedText:
      'Gib den Namen oder die Nummer einer Linie ein, z. B. Victoria, Elizabeth line, 73.',
    lineUnknown: ({ query }) => `TfL hat keine Linie „${query}“.`,
    lineAdded: ({ name }) =>
      `${name} wird verfolgt.\nÖffne den Tab „Entdecken“, um das Gerät anzulegen.`,
    lineAlready: ({ name }) => `${name} wird bereits verfolgt.`,
    tooManyLines: ({ max }) => `Du verfolgst bereits ${max} Linien: entferne zuerst eine.`,
    lineNotFollowed: ({ query }) => `Keine verfolgte Linie heißt „${query}“.`,
    lineRemoved: ({ name }) =>
      `${name} wird nicht mehr verfolgt. Lösche das Gerät in Gladys, wenn du es nicht mehr brauchst.`,
    statusNone: 'Noch keine Linie und keine Haltestelle verfolgt.',
    statusLines: ({ count }) => `${count} Linie(n) verfolgt:`,
    statusStops: ({ count }) => `${count} Haltestelle(n) verfolgt:`,
    statusCreated: 'Gerät angelegt',
    statusNotCreated: 'Gerät noch nicht angelegt (Tab „Entdecken“)',
    statusRefreshed: ({ age }) => `Zuletzt gelesen vor ${age} s.`,
    statusNeverRefreshed: 'Noch nicht gelesen (kein Gerät angelegt).',
    statusError: ({ error }) => `Letzter Fehler: ${error}.`,
    statusKey: 'TfL-Schlüssel: eingetragen.',
    statusNoKey: 'TfL-Schlüssel: keiner (anonymes Kontingent).',
    noArrival: 'Keine Ankunft angekündigt',
    noDisruption: 'Keine Störung',
    pickStop: 'Wähle eine Haltestelle in den Widget-Einstellungen.',
    gone: 'Diese Haltestelle oder Linie wird nicht mehr verfolgt.',
    loading: 'TfL wird gelesen…',
    legend: 'Echtzeitprognosen von TfL, Wartezeit in Minuten.',
    linesHeading: 'Status der TfL-Linien',
    noLines: 'Verfolge eine Linie mit der Aktion „Linie verfolgen“ und lege ihr Gerät an.',
    allGood: 'Normaler Betrieb auf allen verfolgten Linien.',
    unavailable: 'TfL hat noch nicht geantwortet: versuche es in einer Minute erneut.',
    nothingAt: ({ stop }) => `Keine Ankunft in ${stop} angekündigt.`,
    now: 'jetzt',
    in: ({ minutes }) => `in ${minutes} Min.`,
    inTwo: ({ first, second }) => `in ${first} und ${second} Min.`,
    nowThen: ({ second }) => `jetzt, dann in ${second} Min.`,
    sentence: ({ line, destination, stop, when }) =>
      `${line} nach ${destination} ab ${stop}: ${when}`,
    lineSentence: ({ line, status }) => `${line}: ${status}`,
  },
  es: {
    searchNeedText: 'Escriba el nombre de una parada o estación, p. ej. Oxford Circus.',
    searchNone: ({ query }) => `Ninguna parada coincide con «${query}».`,
    searchFound: ({ count }) => `${count} parada(s) encontrada(s):`,
    searchHint:
      'Añada una con «Añadir una parada», por su nombre o por el identificador entre corchetes.',
    serviceDown: ({ error }) =>
      `No se puede contactar con TfL (${error}). Inténtelo de nuevo en un momento.`,
    addUnknown: ({ query }) =>
      `TfL no conoce ninguna parada «${query}». Búsquela primero con «Buscar una parada».`,
    addAmbiguous: 'Varias paradas coinciden: añada una por su identificador.',
    addNoArrivals: ({ query }) =>
      `«${query}» no tiene llegadas de TfL (¿solo National Rail?). Elija otra parada.`,
    addUnknownLines: ({ lines, available }) =>
      `Línea(s) que no paran aquí: ${lines}. Líneas de esta parada: ${available}.`,
    added: ({ name }) => `${name} añadida.\nAbra la pestaña Descubrir para crear su dispositivo.`,
    alreadyWatched: ({ name }) => `${name} ya se sigue con estos filtros.`,
    tooMany: ({ max }) => `Ya sigue ${max} paradas: elimine una primero.`,
    removeUnknown: ({ query }) => `Ninguna parada seguida se llama «${query}».`,
    removeAmbiguous:
      'Varias paradas seguidas coinciden: escriba el nombre completo que aparece en el estado.',
    removed: ({ name }) =>
      `${name} eliminada. Borre su dispositivo en Gladys si ya no lo necesita.`,
    lineNeedText:
      'Escriba el nombre o el número de una línea, p. ej. Victoria, Elizabeth line, 73.',
    lineUnknown: ({ query }) => `TfL no tiene ninguna línea «${query}».`,
    lineAdded: ({ name }) =>
      `${name} seguida.\nAbra la pestaña Descubrir para crear su dispositivo.`,
    lineAlready: ({ name }) => `${name} ya se sigue.`,
    tooManyLines: ({ max }) => `Ya sigue ${max} líneas: elimine una primero.`,
    lineNotFollowed: ({ query }) => `Ninguna línea seguida se llama «${query}».`,
    lineRemoved: ({ name }) =>
      `${name} ya no se sigue. Borre su dispositivo en Gladys si ya no lo necesita.`,
    statusNone: 'Todavía no sigue ninguna línea ni parada.',
    statusLines: ({ count }) => `${count} línea(s) seguida(s):`,
    statusStops: ({ count }) => `${count} parada(s) seguida(s):`,
    statusCreated: 'dispositivo creado',
    statusNotCreated: 'dispositivo aún no creado (pestaña Descubrir)',
    statusRefreshed: ({ age }) => `Última lectura hace ${age} s.`,
    statusNeverRefreshed: 'Aún no leído (ningún dispositivo creado).',
    statusError: ({ error }) => `Último error: ${error}.`,
    statusKey: 'Clave de TfL: configurada.',
    statusNoKey: 'Clave de TfL: ninguna (cuota anónima).',
    noArrival: 'Ninguna llegada anunciada',
    noDisruption: 'Ninguna incidencia',
    pickStop: 'Elija una parada en los ajustes del widget.',
    gone: 'Esta parada o línea ya no se sigue.',
    loading: 'Leyendo TfL…',
    legend: 'Previsiones de TfL en tiempo real, minutos de espera.',
    linesHeading: 'Estado de las líneas de TfL',
    noLines: 'Siga una línea con la acción «Seguir una línea» y cree su dispositivo.',
    allGood: 'Servicio normal en todas las líneas seguidas.',
    unavailable: 'TfL aún no ha respondido: inténtelo de nuevo dentro de un minuto.',
    nothingAt: ({ stop }) => `Ninguna llegada anunciada en ${stop}.`,
    now: 'ahora',
    in: ({ minutes }) => `en ${minutes} min`,
    inTwo: ({ first, second }) => `en ${first} y ${second} min`,
    nowThen: ({ second }) => `ahora y luego en ${second} min`,
    sentence: ({ line, destination, stop, when }) =>
      `${line} hacia ${destination} en ${stop}: ${when}`,
    lineSentence: ({ line, status }) => `${line}: ${status}`,
  },
};

/** One text of a table, in `language` (English when missing). */
export function say(table, language, key, params = {}) {
  const entry = table[language]?.[key] ?? table.en[key];
  return typeof entry === 'function' ? entry(params) : entry;
}

/** One text of a table in the four languages: { en, fr, de, es }. */
export function sayAll(table, key, params = {}) {
  return Object.fromEntries(
    Object.keys(table).map((language) => [language, say(table, language, key, params)]),
  );
}

/** "Tube", "Bus"…: the name of a TfL mode, or the mode itself. */
export const modeName = (mode, language) => (MODES[language] ?? MODES.en)[mode] ?? mode;

/** The name of a severity code, "Minor delays". */
export const severityName = (severity, language) =>
  (SEVERITIES[language] ?? SEVERITIES.en)[severity] ?? SEVERITIES.en[severity] ?? String(severity);

/** The name of a line as people say it: "Victoria", "Elizabeth line", "Bus 73". */
export function lineLabel(line, language) {
  return line.mode === 'bus' ? `${modeName('bus', language)} ${line.name}` : line.name;
}
