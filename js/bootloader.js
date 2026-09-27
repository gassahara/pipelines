// bootloader.js — framework bootstrap and load manifest.
//
// @proposal=P9 (Cycle P9-01) — the manifest provides lists are aligned
// with the post-P5-corrected surface:
//   - `validatepipelinebriefcase` removed from the blockcompiler entry
//     (function was dropped at Cycle 32R; boot failure attribution at
//     RUN 65).
//   - `validaterevivableobject` removed from the fnblock entry (P9.7
//     removes the function; its last caller was validatepipelinebriefcase).

var pipelinesmanifest = [
  { src: 'factory/tuning/limits.js', provides: [
    'fnmaxsourcechars'
  ] },
  { src: 'factory/tokenscanner.js', provides: [
    'isidentifierstart', 'isidentifierpart'
  ] },
  { src: 'factory/parser.js', provides: [
    'parsesource', 'detectfreeidentifiers'
  ] },
  { src: 'factory/fnblock.js', provides: [
    'containsidentifier', 'findmatchingparen', 'findbodybrace',
    'creatednaserializerconstants', 'validaterevivablefunctionblock',
    'resolvefrombriefcase', 'preparefunctionforserialization', 'serializeselfcontainedclosure',
    'preparednaforserialization', 'structuralhash', 'serializefunctionwithdeps', 'serializedepvalue',
    'containsstyleaccess', 'mapoutputs', 'analyzefnblock', 'createblockanalyzer',
    'createblockanalyzers', 'compilefnblock'
  ] },
  { src: 'messageregistry.js', provides: [
    'MESSAGEREGISTRY', 'MESSAGETYPES',
    'MAILBOXFILTERTYPES', 'MESSAGEREGISTRYSTORE'
  ] },
  { src: 'verbosity.js', provides: [
    'createverbosityconstants', 'getverbosity', 'setverbosity',
    'logcritical', 'logerror', 'logwarn', 'loginfo', 'logdebug', 'getverbosityname'
  ] },
  { src: 'functorial/maybe.js', provides: ['just', 'nothing', 'fromnullable', 'getorelselazy', 'maybealgebra'] },
  { src: 'evalstack.js', provides: [
    'evalstackidentity', 'initialevalstack', 'evalstackstate',
    'pushframe', 'popframe', 'peekframe', 'snapshotstack', 'restorestack',
    'currentcontinuation', 'chaincontinuations', 'getcurrentcallerid'
  ] },
  { src: 'factory/callwithstack.js', provides: ['callwithstack'] },
  { src: 'factory/colorutils.js', provides: ['colorcore', 'colorharmony', 'colorcontrast'] },
  { src: 'factory/closureconsolidator.js', provides: ['consolidateclosures'] },
  { src: 'actors/actorcore.js', provides: [
    'CREATEGARBAGECOLLECTOR', 'REGISTEROBJECT', 'UPDATESTATUS', 'INCREMENTSENT',
    'INCREMENTRECEIVED', 'COLLECTENDED', 'LISTOBJECTS', 'REGISTERACTORSTATE',
    'GETACTORSTATE', 'SETACTORSTATE', 'DISPATCHIMMUTABLE', 'DISPATCHTOACTOR',
    'ENSUREENVSLICE', 'CREATEMESSAGEVALIDATOR', 'PINGACTOR', 'GETACTORREGISTRY',
    'CREATEACTORREGISTRY', 'SETRENDERACTOR', 'GETRENDERACTOR',
    'CREATETRIGGERREGISTRY', 'REGISTERTRIGGER', 'UNREGISTERTRIGGER',
    'REVALIDATEALL', 'GETTRIGGERMAP', 'CREATEACTORHANDLE'
  ] },
  { src: 'factory/layoutdirectives.js', provides: ['createlayoutdirectives'] },
  { src: 'fundamental/domref.js', provides: ['getrawelement', 'createdomref', 'removeref', 'isvaliddomref'] },
  { src: 'typesystem.js', provides: [
    'typeschema', 'validatefields', 'validate', 'validatecall', 'validateschema',
    'validateformalblock', 'validatestageflow', 'validatemonadalgebra',
    'validateblockio', 'validateblockfnio', 'validatecontainerrefs', 'validatespawncontracts',
    'validateblocktype', 'validatedomqueryblock', 'validateexecutionqueryblock',
    'validatestorequeryblock', 'validateblockproperties', 'validateeventstage'
  ] },
  { src: 'factory/stylizerutilities.js', provides: ['stylizercore', 'stylizerrewrite'] },
  { src: 'debugformatter.js', provides: ['formatdebugtrace'] },
  { src: 'utils.js', provides: [
    'createapiconstants', 'escapehtml', 'markdowntohtml', 'formataitext',
    'resolvepath', 'getprop', 'getproperty', 'getfunction', 'setproperty',
    'createnodefromtemplate', 'deepmerge'
  ] },
  { src: 'actors/dbactor.js', provides: [
    'DBBEHAVIOR', 'STORESEND', 'STOREWAIT', 'DBSTORE', 'DBRESTORE', 'DBLIST', 'DBDELETE',
    'STARTDBACTOR', 'SUBMIT', 'EXPECT', 'GETACTIONRESULT'
  ] },
  { src: 'actors/mailactor.js', provides: [
    'MAILBEHAVIOR', 'GENERATETAG', 'SENDINSTRUCTION', 'SENDRESPONSE',
    'QUERYMAILBOX', 'WAITFORMAILBOX', 'STARTMAILACTOR', 'MAILGETACTIONSTATUS'
  ], owner: 'MAILACTOR', types: ['SEND', 'ACK'] },
  { src: 'actors/worldmapactor.js', provides: [
    'WORLDMAPBEHAVIOR', 'STARTWORLDMAPACTOR', 'SENDWORLDMAPPATCH',
    'UPDATEWORLDMAPFN', 'OBSERVEWORLDMAP', 'UNOBSERVEWORLDMAP', 'GETWORLDMAP',
    'SUBMIT', 'EXPECT', 'GETACTIONRESULT'
  ], owner: 'WORLDMAPACTOR', types: ['UPDATE', 'UPDATEFN', 'OBSERVE', 'UNOBSERVE', 'GETWORLDMAP'] },
  { src: 'actors/apiactor.js', provides: [
    'APIBEHAVIOR', 'ENQUEUEAPI', 'ENQUEUEFETCH',
    'SUBMIT', 'EXPECT', 'GETACTIONRESULT'
  ], owner: 'APIACTOR', types: ['API', 'FETCH'] },
  { src: 'actors/debugactor.js', provides: [
    'DEBUGBEHAVIOR', 'ENQUEUEDEBUGPING', 'ENQUEUEDEBUGRECOVER',
    'SUBMIT', 'EXPECT', 'GETACTIONRESULT'
  ], owner: 'DEBUGACTOR', types: ['INITOVERLAY', 'SHOW', 'HIDE', 'RECOVER', 'PING', 'LOGLINE'] },
  { src: 'actors/executionactor.js', provides: [
    'EXECUTIONBEHAVIOR',
    'ENQUEUEEXECUTIONPIPELINELOADED', 'ENQUEUEEXECUTIONSUBMIT', 'ENQUEUEEXECUTIONAWAITTASK',
    'ENQUEUEEXECUTIONGETTASKS', 'ENQUEUEEXECUTIONGETTASKSTATUS', 'ENQUEUEEXECUTIONCANCELTASK',
    'ENQUEUEEXECUTIONSTOPTASK', 'ENQUEUEEXECUTIONGETSTATUS', 'ENQUEUEEXECUTIONENVUPDATED',
    'ENQUEUEEXECUTIONCCCABORT', 'ENQUEUEEXECUTIONCCCCONTINUE', 'ENQUEUEEXECUTIONCCCRETRY',
    'ENQUEUEEXECUTIONREGISTERPIPELINE', 'ENQUEUEEXECUTIONRECOVER', 'ENQUEUEEXECUTIONPING',
    'STARTEXECUTIONACTOR', 'ENSUREEXECUTIONACTORREADY',
    'SUBMIT', 'EXPECT', 'GETACTIONRESULT'
  ], owner: 'EXECUTIONACTOR', types: ['PIPELINELOADED', 'ENVUPDATED', 'GETSTATUS', 'EXECUTEELEMENT',
    'AWAITTASK', 'GETTASKS', 'GETTASKSTATUS', 'CANCELTASK', 'STOPTASK', 'CCCABORT',
    'CCCCONTINUE', 'CCCRETRY', 'TASKSETTLED', 'RECOVER', 'REGISTERPIPELINE', 'PING'] },
  { src: 'context.js', provides: ['createinitialworldmap', 'updateworldmap', 'select'] },
  { src: 'actors/renderactor.js', provides: [
    'RENDERBEHAVIOR',
    'ENQUEUERENDER', 'ENQUEUECLEAR', 'ENQUEUEHTML', 'ENQUEUEREMOVE',
    'ENQUEUESTYLES', 'ENQUEUESETATTR', 'ENQUEUETOGGLECLASS',
    'ENQUEUECREATEELEMENT', 'ENQUEUECREATECONTAINER', 'ENQUEUECREATEFROMHTML',
    'ENQUEUEGETHTML', 'ENQUEUEGETVALUE', 'ENQUEUEGETSTYLE',
    'ENQUEUEGETPOSITION', 'ENQUEUEGETLAYOUT',
    'ENQUEUESETHTML', 'ENQUEUESETPOSITION', 'ENQUEUESETSTYLE', 'ENQUEUESETVALUE',
    'ENQUEUEPROPERTY', 'ENQUEUESETLAYOUT',
    'ENQUEUEGETVIEWPORT', 'ENQUEUEGETSCREEN', 'ENQUEUEMATCHMEDIA',
    'STARTRENDERACTOR', 'EXPECTELEMENT', 'HANDLEFILEREADERREQUEST',
    'validatedomquerycommand', 'DOMQUERYCOMMANDREGISTRY',
    'SUBMIT', 'EXPECT', 'GETACTIONRESULT'
  ], owner: 'RENDERACTOR', types: [
    'RENDER', 'CLEAR', 'HTML', 'REMOVE', 'SETSTYLES', 'SETATTR', 'TOGGLECLASS',
    'CRYPTO', 'GEOLOCATION', 'PERSISTENCE', 'CREATEELEMENT', 'CREATECONTAINER',
    'CREATEFROMHTML', 'PROPERTY', 'GETHTML', 'GETVALUE', 'GETSTYLE', 'GETPOSITION',
    'GETLAYOUT', 'SETHTML', 'SETPOSITION', 'SETSTYLE', 'SETVALUE', 'SETLAYOUT',
    'GETVIEWPORT', 'GETSCREEN', 'MATCHMEDIA', 'GETBODYHTML', 'RESTOREBODYHTML',
    'RECOVER', 'PING', 'REGISTEREVENTLISTENER',
    'GETELEMENTS',
    'CHECKOVERFLOW', 'CHECKSPACING', 'CHECKOVERLAP', 'CHECKSCROLLABILITY',
    'CHECKCONTROLLEDOVERLAY', 'CORRECTOVERFLOW', 'CORRECTSPACING', 'CORRECTOVERLAP',
    'CORRECTSCROLLABILITY', 'CORRECTCONTROLLEDOVERLAY',
    'REWRITESTYLEATTRS', 'CONSOLIDATESTYLES', 'OPTIMIZECONTRAST', 'OPTIMIZEHARMONY',
    'OPTIMIZETEXTVISIBILITY', 'OPTIMIZEBUTTONVISIBILITY',
    'VERIFYCONTRAST', 'VERIFYTEXTVISIBILITY', 'VERIFYBUTTONVISIBILITY',
    'VERIFYHARMONY', 'CHECKFOCUSVISIBILITY'
  ] },
  { src: 'factory/blockcompiler.js', provides: [
    'pipeline',
    'makelib', 'makeprogram', 'makestage', 'makeblock', 'makepipelineelement',
    'appendlib', 'appendprogram', 'appendstage', 'appendblock', 'appendpipelineelement',
    'run', 'compile',
    'orchestratepipeline', 'loadpipelineresources',
    'resolvenextelement', 'orchestratestage',
    'createblockcompilerconstants', 'buildblockproperties',
    'processelement', 'processpipelineelement', 'registereventstage',
    'processnestedstage', 'createpersistentelementwrapper', 'wrapblockresult',
    'BLOCKCOMPILERSTATE'
  ] },
  { src: 'actors/hypervisoractor.js', provides: [
    'HYPERVISORBEHAVIOR',
    'ENQUEUEHYPERVISORLOAD', 'ENQUEUEHYPERVISORSAVE',
    'ENQUEUEHYPERVISORGETENV', 'ENQUEUEHYPERVISORSETENV', 'ENQUEUEHYPERVISORGETLATESTENV',
    'ENQUEUEHYPERVISORGETRENDERHTML', 'ENQUEUEHYPERVISORSETRENDERHTML',
    'ENQUEUEHYPERVISORGETEXECUTIONSTACK', 'ENQUEUEHYPERVISORSETEXECUTIONSTACK',
    'ENQUEUEHYPERVISORGETROUTE', 'ENQUEUEHYPERVISORSETROUTE',
    'ENQUEUEHYPERVISORGETACTIVEPIPELINES',
    'ENQUEUEHYPERVISORREGISTERPIPELINE', 'ENQUEUEHYPERVISORUNREGISTERPIPELINE',
    'ENQUEUEHYPERVISORSETPROGRAM', 'ENQUEUEHYPERVISORGETPROGRAM',
    'ENQUEUEHYPERVISORMARKBOOT', 'ENQUEUEHYPERVISORPING',
    'ENQUEUEHYPERVISORACTIVATEACTORS',
    'STARTHYPERVISORACTOR',
    'SUBMIT', 'EXPECT', 'GETACTIONRESULT'
  ], owner: 'HYPERVISORACTOR', types: [
    'LOAD', 'SAVE', 'GETENV', 'SETENV', 'GETLATESTENV',
    'GETRENDERHTML', 'SETRENDERHTML',
    'GETEXECUTIONSTACK', 'SETEXECUTIONSTACK',
    'GETROUTE', 'SETROUTE', 'GETACTIVEPIPELINES',
    'REGISTERPIPELINE', 'UNREGISTERPIPELINE',
    'SETPROGRAM', 'GETPROGRAM', 'MARKBOOT',
    'EVENTTRIGGERED', 'PING', 'RECOVER', 'ACTIVATEACTORS'
  ] },
  { src: 'registerconsumers.js', provides: ['REGISTEREDCONSUMERS'] }
];

function getroot() {
  return (typeof window !== 'undefined') ? window : globalthis;
}

function checkexistence(entry) {
  var root = getroot();
  var missing = [];
  entry.provides.forEach(function(name) {
    if (typeof root[name] === 'undefined') missing.push(name);
  });
  return { ok: missing.length === 0, missing: missing };
}

function checkregistration(entry) {
  if (!entry.owner) return { ok: true, missing: [] };
  var missing = [];
  var reg = (typeof MESSAGEREGISTRY !== 'undefined') ? MESSAGEREGISTRY : null;
  if (!reg) return { ok: false, missing: entry.types };
  var gethandlerfn = reg.gethandler;
  entry.types.forEach(function(type) {
    if (typeof gethandlerfn.call(reg, entry.owner, type) !== 'function') missing.push(type);
  });
  return { ok: missing.length === 0, missing: missing };
}

function checkstateregistration(entry) {
  if (!entry.owner) return { ok: true };
  if (entry.owner !== 'WORLDMAPACTOR') return { ok: true };
  var state = GETACTORSTATE('WORLDMAPACTOR');
  return { ok: state !== undefined, missing: state === undefined ? 'WORLDMAPACTOR' : null };
}

function runpipelineboot(loadprogram, report, manifest) {
  var list = manifest || pipelinesmanifest;
  var index = 0;
  var entries = list.slice();
  var loadfailures = [];
  function loadnext() {
    if (index >= entries.length) {
      var regfailures = [];
      entries.forEach(function(entry) {
        if (entry.owner) {
          var reg = checkregistration(entry);
          if (!reg.ok) regfailures.push({ src: entry.src, missingtypes: reg.missing });
          var st = checkstateregistration(entry);
          if (!st.ok) regfailures.push({ src: entry.src, missingstate: st.missing });
        }
      });
      if (regfailures.length) {
        report({ ok: false, failures: regfailures, loaded: entries.length });
      } else {
        report({ ok: true, failures: [], loaded: entries.length });
      }
      return;
    }
    var entry = entries[index];
    loadprogram(entry, function(err) {
      if (err) {
        loadfailures.push({ src: entry.src, error: err });
        report({ ok: false, failures: loadfailures, loaded: index });
        return;
      }
      var exists = checkexistence(entry);
      if (!exists.ok) {
        loadfailures.push({ src: entry.src, missingglobals: exists.missing });
        report({ ok: false, failures: loadfailures, loaded: index });
        return;
      }
      index = index + 1;
      loadnext();
    });
  }
  loadnext();
}

var pipelinesbase = 'https://gassahara.github.io/pipelines/js/';
function bootpipeline(ondone) {
  function loadscript(entry, done) {
    var s = document.createElement('script');
    s.src = pipelinesbase + entry.src;
    s.onload = function() { done(null); };
    s.onerror = function() { done(new Error('failed to load ' + entry.src)); };
    document.head.appendChild(s);
  }
  runpipelineboot(loadscript, function(result) {
    if (result.ok) {
      console.log('[bootloader] all ' + result.loaded + ' programs loaded, existence tests passed');
    } else {
      console.error('[bootloader] boot failed after ' + result.loaded + ' programs:', JSON.stringify(result.failures));
    }
    if (typeof ondone === 'function') ondone(result);
  });
}
