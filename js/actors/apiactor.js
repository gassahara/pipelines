var APITYPE = messagetype('API', {
  ENDPOINT: stringtype(),
  METHOD: stringtype(),
  PAYLOAD: optionaltype(objecttype()),
  TOKEN: optionaltype(stringtype())
});
var FETCHTYPE = messagetype('FETCH', {
  ENDPOINT: stringtype(),
  METHOD: stringtype(),
  PAYLOAD: optionaltype(objecttype()),
  TOKEN: optionaltype(stringtype())
});
var APIRESULTTYPE = messagetype('APIRESULT', {});
var FETCHRESULTTYPE = messagetype('FETCHRESULT', {});

REGISTERMESSAGETYPE(APITYPE);
REGISTERMESSAGETYPE(FETCHTYPE);
REGISTERMESSAGETYPE(APIRESULTTYPE);
REGISTERMESSAGETYPE(FETCHRESULTTYPE);

REGISTERRESPONSETYPE('APIRESULT');
REGISTERRESPONSETYPE('FETCHRESULT');

// @proposal=P-FACTORY-ACTOR-NAME-INVERSION — the APIACTOR-owned type
// names, published by their owner. The factory layer
// (blockcompilers.js::compilehttpblock) obtains these by calling the
// accessor rather than inlining the string literals.
function APIACTORNAMES() {
  return Object.freeze({
    API: 'API',
    FETCH: 'FETCH',
    APIRESULT: 'APIRESULT',
    FETCHRESULT: 'FETCHRESULT'
  });
}

function APIREQUESTCORE(ENV, ARGS, ISTEXTUAL) {
  logdebug(ENV, '[APIACTOR]', 'ACTION:', ISTEXTUAL ? 'FETCH' : 'API', 'METHOD:', ARGS.METHOD, 'ENDPOINT:', ARGS.ENDPOINT);

  var APISLICE = ENV.API || {};
  var UPDATEDAPI = {
    LASTREQUEST: {
      TYPE: ISTEXTUAL ? 'FETCH' : 'API',
      ENDPOINT: ARGS.ENDPOINT,
      METHOD: ARGS.METHOD,
      PAYLOAD: ARGS.PAYLOAD || {},
      TOKEN: ARGS.TOKEN || '',
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
  var URL = APIBASE + '/' + ARGS.ENDPOINT;
  var METHOD = String(ARGS.METHOD || 'GET').toUpperCase();
  var HEADERS = {
    'Authorization': 'Bearer ' + (ARGS.TOKEN || '')
  };
  if (METHOD === 'POST') {
    HEADERS['Content-Type'] = 'application/json';
  }
  if (ISTEXTUAL) {
    HEADERS['Accept'] = 'text/plain, */*';
  }
  var BODY = METHOD === 'POST' ? JSON.stringify(ARGS.PAYLOAD || {}) : undefined;

  return fetch(URL, { method: METHOD, headers: HEADERS, body: BODY }).then(function(RESPONSE) {
    var STATUS = RESPONSE.status;
    logdebug(ENV, '[APIACTOR]', 'ACTION RESPONSE STATUS:', STATUS, 'FOR:', ARGS.ENDPOINT);
    var PARSED = ISTEXTUAL ? RESPONSE.text() : RESPONSE.json();
    return PARSED.then(function(DATA) {
      return { ENV: BUILDNEXTENV(), RESPONSE: { STATUS: STATUS, DATA: DATA } };
    });
  }).catch(function(ERR) {
    logerror(ENV, '[APIACTOR]', 'ACTION REQUEST ERROR FOR:', ARGS.ENDPOINT, ERR);
    return { ENV: BUILDNEXTENV(), RESPONSE: { ERROR: ERR.message || String(ERR) } };
  });
}

function APIHANDLER_API(ENV, ARGS)   { return APIREQUESTCORE(ENV, ARGS, false); }
function APIHANDLER_FETCH(ENV, ARGS) { return APIREQUESTCORE(ENV, ARGS, true); }

REGISTERACTORMESSAGE('APIACTOR', APITYPE, APIHANDLER_API);
REGISTERACTORMESSAGE('APIACTOR', FETCHTYPE, APIHANDLER_FETCH);

function APIBEHAVIOR(ENV, MESSAGE) {
  var OUT = INVOKEHANDLER('APIACTOR', ENV, MESSAGE);
  if (OUT.matched !== true) return ENV;
  return OUT.result;
}

REGISTERDISPATCH('APIACTOR', APIBEHAVIOR);

function ENQUEUEAPI(ENDPOINT, METHOD, PAYLOAD, OPTIONS, RESPONSESPEC) {
  var TAG = GENERATETAG();
  SENDINSTRUCTION('APIACTOR', 'API', {
    ENDPOINT: ENDPOINT,
    METHOD: METHOD,
    PAYLOAD: PAYLOAD || {},
    TOKEN: (OPTIONS && OPTIONS.TOKEN) || ''
  }, TAG, 'system', RESPONSESPEC);
}

function ENQUEUEFETCH(ENDPOINT, METHOD, PAYLOAD, OPTIONS, RESPONSESPEC) {
  var TAG = GENERATETAG();
  SENDINSTRUCTION('APIACTOR', 'FETCH', {
    ENDPOINT: ENDPOINT,
    METHOD: METHOD,
    PAYLOAD: PAYLOAD || {},
    TOKEN: (OPTIONS && OPTIONS.TOKEN) || ''
  }, TAG, 'system', RESPONSESPEC);
}

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
