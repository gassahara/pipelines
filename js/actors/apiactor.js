function APIREQUESTHANDLER(ENV, MESSAGE) {
  logdebug(ENV, '[APIACTOR]', 'ACTION:', MESSAGE.TYPE, 'METHOD:', MESSAGE.METHOD, 'ENDPOINT:', MESSAGE.ENDPOINT);

  var APISLICE = ENV.API || {};
  var UPDATEDAPI = {
    LASTREQUEST: {
      TYPE: MESSAGE.TYPE,
      ENDPOINT: MESSAGE.ENDPOINT,
      METHOD: MESSAGE.METHOD,
      PAYLOAD: MESSAGE.PAYLOAD || {},
      TOKEN: MESSAGE.TOKEN || '',
      TIMESTAMP: Date.now()
    },
    REQUESTCOUNT: (APISLICE.REQUESTCOUNT || 0) + 1
  };

  function BUILDNEXTENV() {
    var NEXTENV = {};
    Object.keys(ENV).forEach(function(K) { NEXTENV[K] = ENV[K]; });
    NEXTENV.API = UPDATEDAPI;
    return NEXTENV;
  }

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

  return fetch(URL, { method: METHOD, headers: HEADERS, body: BODY }).then(function(RESPONSE) {
    var STATUS = RESPONSE.status;
    logdebug(ENV, '[APIACTOR]', 'ACTION RESPONSE STATUS:', STATUS, 'FOR:', MESSAGE.ENDPOINT);
    var PARSED = ISTEXTUAL ? RESPONSE.text() : RESPONSE.json();
    return PARSED.then(function(DATA) {
      return { ENV: BUILDNEXTENV(), RESPONSE: { STATUS: STATUS, DATA: DATA } };
    });
  }).catch(function(ERR) {
    logerror(ENV, '[APIACTOR]', 'ACTION REQUEST ERROR FOR:', MESSAGE.ENDPOINT, ERR);
    return { ENV: BUILDNEXTENV(), RESPONSE: { ERROR: ERR.message || String(ERR) } };
  });
}

// ============================================================
// §2 — Dispatcher surface
// ============================================================

var APIDISPATCH = MAKEACTORDISPATCHSURFACE('APIACTOR', [
  MAKETYPEDDISPATCH(MESSAGETYPES.API, APIREQUESTHANDLER),
  MAKETYPEDDISPATCH(MESSAGETYPES.FETCH, APIREQUESTHANDLER)
]);

// @proposal=P64 — the actor's behaviour is the surface's dispatch.
function APIBEHAVIOR(ENV, MESSAGE) {
  return APIDISPATCH.DISPATCH(ENV, MESSAGE);
}

// @proposal=P64 — publish the surface and the aggregate, and self-register.
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
