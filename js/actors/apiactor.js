
function APIREQUESTHANDLER(ENV, MESSAGE) {
  logdebug(ENV, '[APIACTOR]', 'ACTION:', MESSAGE.TYPE, 'METHOD:', MESSAGE.METHOD, 'ENDPOINT:', MESSAGE.ENDPOINT);

  var UPDATEDAPI = {
    LASTREQUEST: {
      TYPE: MESSAGE.TYPE,
      ENDPOINT: MESSAGE.ENDPOINT,
      METHOD: MESSAGE.METHOD,
      PAYLOAD: MESSAGE.PAYLOAD || {},
      TOKEN: MESSAGE.TOKEN || '',
      TIMESTAMP: Date.now()
    },
    REQUESTCOUNT: ((ENV.API && ENV.API.REQUESTCOUNT) || 0) + 1
  };

  SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
    UPDATES: [{ PATH: 'API', VALUE: UPDATEDAPI }]
  }, GENERATETAG(), 'APIACTOR');

  var APICONSTANTS = (typeof createapiconstants === 'function') ? createapiconstants() : { APIBASE: 'https://vflkhntzwfovnuyccxow.supabase.co/functions/v1' };
  var APIBASE = APICONSTANTS.APIBASE || '';
  var URL = APIBASE + '/' + MESSAGE.ENDPOINT;
  var ISTEXTUAL = MESSAGE.TYPE === MESSAGETYPES.FETCH;
  var METHOD = String(MESSAGE.METHOD || 'GET').toUpperCase();
  var HEADERS = {
    'Authorization': 'Bearer ' + (MESSAGE.TOKEN || '')
  };
  if (METHOD === 'POST') {
    HEADERS['Content-Type'] = 'application/json';
  }
  if (ISTEXTUAL) {
    HEADERS['Accept'] = 'text/plain, */*';
  }
  var BODY = METHOD === 'POST' ? JSON.stringify(MESSAGE.PAYLOAD || {}) : undefined;

  fetch(URL, { method: METHOD, headers: HEADERS, body: BODY }).then(function(RESPONSE) {
    var STATUS = RESPONSE.status;
    logdebug(ENV, '[APIACTOR]', 'ACTION RESPONSE STATUS:', STATUS, 'FOR:', MESSAGE.ENDPOINT);
    if (!ISTEXTUAL) {
      return RESPONSE.json().then(function(DATA) {
        logdebug(ENV, '[APIACTOR]', 'ACTION JSON RESPONSE RECEIVED FOR:', MESSAGE.ENDPOINT);
        var RESPONSESPEC = MESSAGE.RESPONSESPEC;
        var RESPONSETYPE = (RESPONSESPEC && (RESPONSESPEC.responsetype || RESPONSESPEC.responseType)) || 'response';
        SENDRESPONSE(MESSAGE.SENDER, MESSAGE.TAG, { STATUS: STATUS, DATA: DATA }, 'APIACTOR', RESPONSETYPE);
      });
    }
    return RESPONSE.text().then(function(DATA) {
      logdebug(ENV, '[APIACTOR]', 'ACTION TEXT RESPONSE RECEIVED FOR:', MESSAGE.ENDPOINT);
      var RESPONSESPEC = MESSAGE.RESPONSESPEC;
      var RESPONSETYPE = (RESPONSESPEC && (RESPONSESPEC.responsetype || RESPONSESPEC.responseType)) || 'response';
      SENDRESPONSE(MESSAGE.SENDER, MESSAGE.TAG, { STATUS: STATUS, DATA: DATA }, 'APIACTOR', RESPONSETYPE);
    });
  }).catch(function(ERR) {
    logerror(ENV, '[APIACTOR]', 'ACTION REQUEST ERROR FOR:', MESSAGE.ENDPOINT, ERR);
    var RESPONSESPEC = MESSAGE.RESPONSESPEC;
    var RESPONSETYPE = (RESPONSESPEC && (RESPONSESPEC.responsetype || RESPONSESPEC.responseType)) || 'response';
    SENDRESPONSE(MESSAGE.SENDER, MESSAGE.TAG, { ERROR: ERR.message || String(ERR) }, 'APIACTOR', RESPONSETYPE);
  });

  return ENV;
}

// ============================================================
// §2 — Dispatcher surface
// ============================================================

var APIDISPATCH = MAKEACTORDISPATCHSURFACE('APIACTOR', [
  MAKETYPEDDISPATCH(MESSAGETYPES.API, APIREQUESTHANDLER),
  MAKETYPEDDISPATCH(MESSAGETYPES.FETCH, APIREQUESTHANDLER)
]);

// @proposal=P64 — the actor's behaviour is the surface's dispatch. The
// switch is gone; the surface is the case list.
function APIBEHAVIOR(ENV, MESSAGE) {
  return APIDISPATCH.DISPATCH(ENV, MESSAGE);
}

// @proposal=P64 — publish the surface and the aggregate, and self-register
// at the actor level so the mail routing fallback finds this actor.
REGISTERACTORSURFACE('APIACTOR', APIDISPATCH);
REGISTERAGGREGATEBEHAVIOR('APIACTOR', APIBEHAVIOR);
ACTORCONSUMERS['APIACTOR'] = APIBEHAVIOR;

// ============================================================
// §3 — Enqueue helpers (unchanged)
// ============================================================

function ENQUEUEAPI(ENDPOINT, METHOD, PAYLOAD, OPTIONS, RESPONSESPEC) {
  var TAG = GENERATETAG();
  SENDINSTRUCTION('APIACTOR', MESSAGETYPES.API, {
    ENDPOINT: ENDPOINT,
    METHOD: METHOD,
    PAYLOAD: PAYLOAD || {},
    TOKEN: (OPTIONS && OPTIONS.TOKEN) || ''
  }, TAG, 'system', RESPONSESPEC);
}

function ENQUEUEFETCH(ENDPOINT, METHOD, PAYLOAD, OPTIONS, RESPONSESPEC) {
  var TAG = GENERATETAG();
  SENDINSTRUCTION('APIACTOR', MESSAGETYPES.FETCH, {
    ENDPOINT: ENDPOINT,
    METHOD: METHOD,
    PAYLOAD: PAYLOAD || {},
    TOKEN: (OPTIONS && OPTIONS.TOKEN) || ''
  }, TAG, 'system', RESPONSESPEC);
}

// ============================================================
// §4 — Actor handle surface (unchanged)
// ============================================================
//
// @proposal=P4 — the three-operation protocol. Uses CREATEACTORHANDLE
// from actorcore.js. Existing behaviour preserved byte-for-byte.

var APIHANDLE = null;

function APIHANDLEINSTANCE() {
  if (!APIHANDLE) {
    APIHANDLE = CREATEACTORHANDLE('APIACTOR');
  }
  return APIHANDLE;
}

function SUBMIT(ACTION) { return APIHANDLEINSTANCE().SUBMIT(ACTION); }
function EXPECT(ID, INTERVAL, TIMEOUT) { return APIHANDLEINSTANCE().EXPECT(ID, INTERVAL, TIMEOUT); }
function GETACTIONRESULT(ID) { return APIHANDLEINSTANCE().GETACTIONRESULT(ID); }
