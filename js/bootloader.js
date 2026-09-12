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
    'creatednaserializerconstants', 'validaterevivablefunctionblock', 'validaterevivableobject',
    'resolvefrombriefcase', 'preparefunctionforserialization', 'serializeselfcontainedclosure',
    'preparednaforserialization', 'structuralhash', 'serializefunctionwithdeps', 'serializedepvalue',
    'containsstyleaccess', 'mapoutputs', 'analyzefnblock', 'createblockanalyzer',
    'createblockanalyzers', 'compilefnblock'
  ] },
  { src: 'messageregistry.js', provides: ['MESSAGEREGISTRY', 'MESSAGETYPES'] },
  { src: 'verbosity.js', provides: [
    'createverbosityconstants', 'getverbosity', 'setverbosity',
    'logcritical', 'logerror', 'logwarn', 'loginfo', 'logdebug', 'getverbosityname'
  ] },
  { src: 'functorial/maybe.js', provides: ['just', 'nothing', 'fromnullable', 'getorelselazy', 'maybealgebra'] },
  { src: 'evalstack.js', provides: ['createevalstack', 'evalstack', 'frames', 'pushframe', 'popframe', 'peekframe', 'snapshotstack', 'restorestack', 'currentcontinuation', 'chaincontinuations'] },
  { src: 'factory/callwithstack.js', provides: ['callwithstack'] },
  { src: 'factory/colorutils.js', provides: ['colorcore', 'colorharmony', 'colorcontrast'] },
  { src: 'factory/closureconsolidator.js', provides: ['consolidateclosures'] },
  { src: 'factory/domqueryconstants.js', provides: ['domquerygetters', 'domquerysetters', 'domquerymessages'] },
  { src: 'actors/actorcore.js', provides: ['CREATEGARBAGECOLLECTOR', 'REGISTEROBJECT', 'UPDATESTATUS', 'INCREMENTSENT', 'INCREMENTRECEIVED', 'COLLECTENDED', 'LISTOBJECTS', 'REGISTERACTORSTATE', 'GETACTORSTATE', 'SETACTORSTATE', 'DISPATCHIMMUTABLE', 'DISPATCHTOACTOR', 'ENSUREENVSLICE', 'CREATEMESSAGEVALIDATOR', 'PINGACTOR', 'GETACTORREGISTRY', 'CREATEACTORREGISTRY', 'SETRENDERACTOR', 'GETRENDERACTOR', 'CREATETRIGGERREGISTRY', 'REGISTERTRIGGER', 'UNREGISTERTRIGGER', 'REVALIDATEALL', 'GETTRIGGERMAP'] },
  { src: 'factory/layoutdirectives.js', provides: ['createlayoutdirectives'] },
  { src: 'fundamental/domref.js', provides: ['getrawelement', 'createdomref', 'removeref', 'isvaliddomref'] },
  { src: 'typesystem.js', provides: ['typeschema', 'validatefields', 'validate', 'validatecall', 'validateschema', 'validateformalblock', 'validatestageflow', 'validatemonadalgebra', 'validateblockio', 'validateblockfnio', 'validatecontainerrefs', 'validatespawncontracts', 'validateblocktype', 'validatedomqueryblock', 'validateexecutionqueryblock', 'validatestorequeryblock', 'validateblockproperties', 'validateeventstage'] },
  { src: 'factory/stylizerutilities.js', provides: ['stylizercore', 'stylizerrewrite', 'stylizerverify'] },
  { src: 'debugformatter.js', provides: ['formatdebugtrace'] },
  { src: 'utils.js', provides: ['createapiconstants', 'escapehtml', 'markdowntohtml', 'formataitext', 'resolvepath', 'getprop', 'getproperty', 'getfunction', 'setproperty', 'createnodefromtemplate', 'deepmerge'] },
  { src: 'actors/dbactor.js', provides: ['DBBEHAVIOR', 'STORESEND', 'STOREWAIT', 'DBSTORE', 'DBRESTORE', 'DBLIST', 'DBDELETE', 'STARTDBACTOR'] },
  { src: 'actors/mailactor.js', provides: ['MAILBEHAVIOR', 'GENERATETAG', 'SENDINSTRUCTION', 'SENDRESPONSE', 'QUERYMAILBOX', 'WAITFORMAILBOX', 'STARTMAILACTOR'], owner: 'MAILACTOR', types: ['SEND', 'ACK'] },
  { src: 'actors/worldmapactor.js', provides: ['WORLDMAPBEHAVIOR', 'STARTWORLDMAPACTOR', 'SENDWORLDMAPPATCH', 'UPDATEWORLDMAPFN', 'OBSERVEWORLDMAP', 'UNOBSERVEWORLDMAP', 'GETWORLDMAP'], owner: 'WORLDMAPACTOR', types: ['UPDATE', 'UPDATEFN', 'OBSERVE', 'UNOBSERVE', 'GETWORLDMAP'] },
  { src: 'actors/apiactor.js', provides: ['APIBEHAVIOR', 'ENQUEUEAPI', 'ENQUEUEFETCH'], owner: 'APIACTOR', types: ['API', 'FETCH'] },
  { src: 'actors/debugactor.js', provides: ['DEBUGBEHAVIOR', 'ENQUEUEDEBUGPING', 'ENQUEUEDEBUGRECOVER'], owner: 'DEBUGACTOR', types: ['INITOVERLAY', 'SHOW', 'HIDE', 'RECOVER', 'PING', 'LOGLINE'] },
  { src: 'actors/executionactor.js', provides: ['EXECUTIONBEHAVIOR', 'ENQUEUEEXECUTIONPIPELINELOADED', 'ENQUEUEEXECUTIONSUBMIT', 'ENQUEUEEXECUTIONAWAITTASK', 'ENQUEUEEXECUTIONGETTASKS', 'ENQUEUEEXECUTIONGETTASKSTATUS', 'ENQUEUEEXECUTIONCANCELTASK', 'ENQUEUEEXECUTIONSTOPTASK', 'ENQUEUEEXECUTIONGETSTATUS', 'ENQUEUEEXECUTIONENVUPDATED', 'ENQUEUEEXECUTIONCCCABORT', 'ENQUEUEEXECUTIONCCCCONTINUE', 'ENQUEUEEXECUTIONCCCRETRY', 'ENQUEUEEXECUTIONREGISTERPIPELINE', 'ENQUEUEEXECUTIONRECOVER', 'ENQUEUEEXECUTIONPING', 'STARTEXECUTIONACTOR', 'ENSUREEXECUTIONACTORREADY'], owner: 'EXECUTIONACTOR', types: ['PIPELINELOADED', 'ENVUPDATED', 'GETSTATUS', 'EXECUTEELEMENT', 'AWAITTASK', 'GETTASKS', 'GETTASKSTATUS', 'CANCELTASK', 'STOPTASK', 'CCCABORT', 'CCCCONTINUE', 'CCCRETRY', 'TASKSETTLED', 'RECOVER', 'REGISTERPIPELINE', 'PING'] },
  { src: 'context.js', provides: ['createinitialworldmap', 'updateworldmap', 'select'] },
  { src: 'actors/renderactor.js', provides: ['RENDERBEHAVIOR', 'ENQUEUERENDER', 'ENQUEUECLEAR', 'ENQUEUEHTML', 'ENQUEUEREMOVE', 'ENQUEUESTYLES', 'ENQUEUESETATTR', 'ENQUEUETOGGLECLASS', 'ENQUEUECREATEELEMENT', 'ENQUEUECREATECONTAINER', 'ENQUEUECREATEFROMHTML', 'ENQUEUEGETHTML', 'ENQUEUEGETVALUE', 'ENQUEUEGETSTYLE', 'ENQUEUEGETPOSITION', 'ENQUEUEGETLAYOUT', 'ENQUEUESETHTML', 'ENQUEUESETPOSITION', 'ENQUEUESETSTYLE', 'ENQUEUESETVALUE', 'ENQUEUEPROPERTY', 'ENQUEUESETLAYOUT', 'ENQUEUEGETVIEWPORT', 'ENQUEUEGETSCREEN', 'ENQUEUEMATCHMEDIA', 'STARTRENDERACTOR', 'EXPECTELEMENT', 'HANDLEFILEREADERREQUEST'], owner: 'RENDERACTOR', types: ['RENDER', 'CLEAR', 'HTML', 'REMOVE', 'SETSTYLES', 'SETATTR', 'TOGGLECLASS', 'CRYPTO', 'GEOLOCATION', 'PERSISTENCE', 'CREATEELEMENT', 'CREATECONTAINER', 'CREATEFROMHTML', 'PROPERTY', 'GETHTML', 'GETVALUE', 'GETSTYLE', 'GETPOSITION', 'GETLAYOUT', 'SETHTML', 'SETPOSITION', 'SETSTYLE', 'SETVALUE', 'SETLAYOUT', 'GETVIEWPORT', 'GETSCREEN', 'MATCHMEDIA', 'GETBODYHTML', 'RESTOREBODYHTML', 'RECOVER', 'PING', 'REGISTEREVENTLISTENER'] },
  { src: 'factory/blockcompiler.js', provides: [
    'LOADPIPELINE', 'resolvenextelement', 'orchestratestage', 'validatepipelinebriefcase',
    'BLOCKCOMPILERCOMPILESTAGE', 'createblockcompilerconstants', 'buildblockproperties',
    'processelement', 'processpipelineelement', 'registereventstage', 'processnestedstage',
    'createpersistentelementwrapper'
  ] },
  { src: 'actors/hypervisoractor.js', provides: ['HYPERVISORBEHAVIOR', 'ENQUEUEHYPERVISORLOAD', 'ENQUEUEHYPERVISORSAVE', 'ENQUEUEHYPERVISORGETENV', 'ENQUEUEHYPERVISORSETENV', 'ENQUEUEHYPERVISORGETLATESTENV', 'ENQUEUEHYPERVISORGETRENDERHTML', 'ENQUEUEHYPERVISORSETRENDERHTML', 'ENQUEUEHYPERVISORGETEXECUTIONSTACK', 'ENQUEUEHYPERVISORSETEXECUTIONSTACK', 'ENQUEUEHYPERVISORGETROUTE', 'ENQUEUEHYPERVISORSETROUTE', 'ENQUEUEHYPERVISORGETACTIVEPIPELINES', 'ENQUEUEHYPERVISORREGISTERPIPELINE', 'ENQUEUEHYPERVISORUNREGISTERPIPELINE', 'ENQUEUEHYPERVISORSETPROGRAM', 'ENQUEUEHYPERVISORGETPROGRAM', 'ENQUEUEHYPERVISORMARKBOOT', 'ENQUEUEHYPERVISORPING', 'ENQUEUEHYPERVISORACTIVATEACTORS', 'ENQUEUEHYPERVISORSTAGECOMPLETED', 'STARTHYPERVISORACTOR'], owner: 'HYPERVISORACTOR', types: [
    'LOAD', 'SAVE', 'GETENV', 'SETENV', 'GETLATESTENV',
    'GETRENDERHTML', 'SETRENDERHTML', 'GETEXECUTIONSTACK', 'SETEXECUTIONSTACK',
    'GETROUTE', 'SETROUTE', 'GETACTIVEPIPELINES',
    'REGISTERPIPELINE', 'UNREGISTERPIPELINE',
    'SETPROGRAM', 'GETPROGRAM', 'MARKBOOT',
    'EVENTTRIGGERED', 'PING', 'RECOVER', 'ACTIVATEACTORS',
    'COMPILESTAGE', 'STAGECOMPLETED'
  ] },
  { src: 'registerconsumers.js', provides: ['registeredconsumers'] }
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
          if (!reg.ok) {
            regfailures.push({ src: entry.src, missingtypes: reg.missing });
          }
          var st = checkstateregistration(entry);
          if (!st.ok) {
            regfailures.push({ src: entry.src, missingstate: st.missing });
          }
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
