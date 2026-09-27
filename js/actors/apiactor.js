function APIBEHAVIOR(ENV, MESSAGE) {
  logdebug(ENV, '[APIACTOR]', 'BEHAVIOR HANDLING ACTION:', MESSAGE.TYPE);

  if (MESSAGE.TYPE === MESSAGETYPES.API || MESSAGE.TYPE === MESSAGETYPES.FETCH) {
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
  }

  return ENV;
}

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

// ---------- ACTOR HANDLE SURFACE — @proposal=P4 ----------
//
// The three operations are sourced from CREATEACTORHANDLE (declared at
// Cycle 18 in actorcore.js). APIBEHAVIOR and the ENQUEUE helpers are
// unchanged. SUBMIT routes through the mail system (Q6); EXPECT polls
// GETACTIONRESULT until a response (including error) is obtained, and
// rejects on timeout or EXPIRED (Q7); GETACTIONRESULT is a non-blocking
// read of the mail-system records (Q8).

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
