var pipelinesmanifest = [
  { src: 'messageregistry.js', provides: ['messageregistry', 'MESSAGETYPES'] },
  { src: 'verbosity.js', provides: [
      'createverbosityconstants', 'createverbosityfunctions', 'getverbosity', 'setverbosity',
      'logcritical', 'logerror', 'logwarn', 'loginfo', 'logdebug', 'getverbosityname',
      'CREATEVERBOSITYCONSTANTS', 'CREATEVERBOSITYFUNCTIONS', 'GETVERBOSITY', 'SETVERBOSITY',
      'LOGCRITICAL', 'LOGERROR', 'LOGWARN', 'LOGINFO', 'LOGDEBUG', 'GETVERBOSITYNAME',
      'CREATECONSTANTS'
    ] },
  { src: 'functorial/maybe.js', provides: ['just', 'nothing', 'of', 'fromnullable', 'getorelselazy', 'maybealgebra'] },
  { src: 'evalstack.js', provides: ['createevalstack', 'evalstack', 'frames', 'pushframe', 'popframe', 'peekframe', 'snapshotstack', 'restorestack', 'currentcontinuation', 'chaincontinuations'] },
  { src: 'factory/callwithstack.js', provides: ['callwithstack', 'runwithstack'] },
  { src: 'factory/colorutils.js', provides: ['colorcore', 'colorharmony', 'colorcontrast'] },
  { src: 'factory/closureconsolidator.js', provides: ['consolidateclosures'] },
  { src: 'factory/freevarparser.js', provides: ['detectfreeidentifiers', 'isidentifierstart', 'isidentifierpart', 'containsidentifier', 'findmatchingparen', 'findbodybrace'] },
  { src: 'factory/domqueryconstants.js', provides: ['domquerygetters', 'domquerysetters', 'domquerymessages'] },
  { src: 'actors/actorcore.js', provides: ['CREATEGARBAGECOLLECTOR', 'REGISTEROBJECT', 'UPDATESTATUS', 'INCREMENTSENT', 'INCREMENTRECEIVED', 'COLLECTENDED', 'LISTOBJECTS', 'REGISTERACTORSTATE', 'GETACTORSTATE', 'SETACTORSTATE', 'DISPATCHIMMUTABLE', 'DISPATCHTOACTOR', 'ENSUREENVSLICE', 'CREATEMESSAGEVALIDATOR', 'PINGACTOR', 'GETACTORREGISTRY', 'CREATEACTORREGISTRY', 'SETRENDERACTOR', 'GETRENDERACTOR', 'CREATETRIGGERREGISTRY', 'REGISTERTRIGGER', 'UNREGISTERTRIGGER', 'REVALIDATEALL', 'GETTRIGGERMAP'] },
  { src: 'factory/layoutdirectives.js', provides: ['createlayoutdirectives'] },
  { src: 'fundamental/domref.js', provides: [
      'getrawelement', 'createdomref', 'removeref', 'isvaliddomref',
      'CREATEDOMREF', 'GETRAWELEMENT', 'REMOVEREF', 'ISVALIDDOMREF'
    ] },
  { src: 'typesystem.js', provides: ['typeschema', 'validatefields', 'validate', 'validatecall', 'validateschema', 'validateformalblock', 'validatestageflow', 'validatemonadalgebra', 'validateblockio', 'validateblockfnio', 'validatecontainerrefs', 'validatespawncontracts', 'validateblocktype', 'validatedomqueryblock', 'validateexecutionqueryblock', 'validatestorequeryblock', 'validateblockproperties', 'validateeventstage'] },
  { src: 'factory/stylizerutilities.js', provides: ['stylizercore', 'stylizerrewrite', 'stylizerverify'] },
  { src: 'factory/dnaserializer.js', provides: ['creatednaserializerconstants', 'validaterevivablefunctionblock', 'validaterevivableobject', 'resolvefrombriefcase', 'preparefunctionforserialization', 'serializeselfcontainedclosure'] },
  { src: 'debugformatter.js', provides: ['formatdebugtrace'] },
  { src: 'utils.js', provides: ['createapiconstants', 'escapehtml', 'markdowntohtml', 'formataitext', 'resolvepath', 'getprop', 'getproperty', 'getfunction', 'setproperty', 'createnodefromtemplate', 'deepmerge'] },
  { src: 'actors/dbactor.js', provides: ['DBBEHAVIOR', 'STORESEND', 'STOREWAIT', 'DBSTORE', 'DBRESTORE', 'DBLIST', 'DBDELETE', 'STARTDBACTOR'] },
  { src: 'actors/mailactor.js', provides: ['MAILBEHAVIOR', 'GENERATETAG', 'SENDINSTRUCTION', 'SENDRESPONSE', 'QUERYMAILBOX', 'WAITFORMAILBOX', 'STARTMAILACTOR'], owner: 'MAILACTOR', types: ['send', 'ack'] },
  { src: 'actors/worldmapactor.js', provides: ['WORLDMAPBEHAVIOR', 'STARTWORLDMAPACTOR', 'SENDWORLDMAPPATCH', 'UPDATEWORLDMAPFN', 'OBSERVEWORLDMAP', 'UNOBSERVEWORLDMAP', 'GETWORLDMAP'], owner: 'WORLDMAPACTOR', types: ['update', 'updatefn', 'observe', 'unobserve', 'getworldmap'] },
  { src: 'actors/apiactor.js', provides: ['APIBEHAVIOR', 'ENQUEUEAPI', 'ENQUEUEFETCH'], owner: 'APIACTOR', types: ['api', 'fetch'] },
  { src: 'actors/debugactor.js', provides: ['DEBUGBEHAVIOR', 'ENQUEUEDEBUGPING', 'ENQUEUEDEBUGRECOVER'], owner: 'DEBUGACTOR', types: ['initoverlay', 'show', 'hide', 'recover', 'ping'] },
  { src: 'actors/executionactor.js', provides: ['EXECUTIONBEHAVIOR', 'ENQUEUEEXECUTIONPIPELINELOADED', 'ENQUEUEEXECUTIONSUBMIT', 'ENQUEUEEXECUTIONAWAITTASK', 'ENQUEUEEXECUTIONGETTASKS', 'ENQUEUEEXECUTIONGETTASKSTATUS', 'ENQUEUEEXECUTIONCANCELTASK', 'ENQUEUEEXECUTIONSTOPTASK', 'ENQUEUEEXECUTIONGETSTATUS', 'ENQUEUEEXECUTIONENVUPDATED', 'ENQUEUEEXECUTIONCCCABORT', 'ENQUEUEEXECUTIONCCCCONTINUE', 'ENQUEUEEXECUTIONCCCRETRY', 'ENQUEUEEXECUTIONREGISTERPIPELINE', 'ENQUEUEEXECUTIONRECOVER', 'ENQUEUEEXECUTIONPING', 'STARTEXECUTIONACTOR', 'ENSUREEXECUTIONACTORREADY'], owner: 'EXECUTIONACTOR', types: ['pipelineloaded', 'envupdated', 'getstatus', 'executeelement', 'awaittask', 'gettasks', 'gettaskstatus', 'canceltask', 'stoptask', 'cccabort', 'ccccontinue', 'cccretry', 'tasksettled', 'recover', 'registerpipeline', 'ping'] },
  { src: 'context.js', provides: ['createinitialworldmap', 'updateworldmap', 'select'] },
  { src: 'actors/renderactor.js', provides: ['RENDERBEHAVIOR', 'ENQUEUERENDER', 'ENQUEUECLEAR', 'ENQUEUEHTML', 'ENQUEUEREMOVE', 'ENQUEUESTYLES', 'ENQUEUESETATTR', 'ENQUEUETOGGLECLASS', 'ENQUEUECREATEELEMENT', 'ENQUEUECREATECONTAINER', 'ENQUEUECREATEFROMHTML', 'ENQUEUEGETHTML', 'ENQUEUEGETVALUE', 'ENQUEUEGETSTYLE', 'ENQUEUEGETPOSITION', 'ENQUEUEGETLAYOUT', 'ENQUEUESETHTML', 'ENQUEUESETPOSITION', 'ENQUEUESETSTYLE', 'ENQUEUESETVALUE', 'ENQUEUEPROPERTY', 'ENQUEUESETLAYOUT', 'ENQUEUEGETVIEWPORT', 'ENQUEUEGETSCREEN', 'ENQUEUEMATCHMEDIA', 'STARTRENDERACTOR', 'EXPECTELEMENT', 'HANDLEFILEREADERREQUEST'], owner: 'RENDERACTOR', types: ['render', 'clear', 'html', 'remove', 'setstyles', 'setattr', 'toggleclass', 'crypto', 'geolocation', 'persistence', 'createelement', 'createcontainer', 'createfromhtml', 'property', 'gethtml', 'getvalue', 'getstyle', 'getposition', 'getlayout', 'sethtml', 'setposition', 'setstyle', 'setvalue', 'setlayout', 'getviewport', 'getscreen', 'matchmedia', 'getbodyhtml', 'restorebodyhtml', 'recover', 'ping', 'registereventlistener'] },
  { src: 'factory/blockcompiler.js', provides: [
      'loadpipeline', 'compilestage', 'resolvenextelement', 'orchestratestage', 'validatepipelinebriefcase',
      'blockcompilercompilestage', 'createblockcompilerconstants', 'buildblockproperties',
      'processelement', 'processpipelineelement', 'registereventstage', 'processnestedstage',
      'createpersistentelementwrapper',
      'BLOCKCOMPILERCOMPILESTAGE', 'COMPILESTAGE', 'LOADPIPELINE', 'RESOLVENEXTELEMENT',
      'ORCHESTRATESTAGE', 'VALIDATEPIPELINEBRIEFCASE', 'BUILD_BLOCK_PROPERTIES',
      'PROCESS_ELEMENT', 'PROCESS_PIPELINE_ELEMENT', 'REGISTER_EVENT_STAGE',
      'PROCESS_NESTED_STAGE', 'CREATE_PERSISTENT_ELEMENT_WRAPPER'
    ] },
  { src: 'actors/hypervisoractor.js', provides: ['HYPERVISORBEHAVIOR', 'ENQUEUEHYPERVISORLOAD', 'ENQUEUEHYPERVISORSAVE', 'ENQUEUEHYPERVISORGETENV', 'ENQUEUEHYPERVISORSETENV', 'ENQUEUEHYPERVISORGETLATESTENV', 'ENQUEUEHYPERVISORGETRENDERHTML', 'ENQUEUEHYPERVISORSETRENDERHTML', 'ENQUEUEHYPERVISORGETEXECUTIONSTACK', 'ENQUEUEHYPERVISORSETEXECUTIONSTACK', 'ENQUEUEHYPERVISORGETROUTE', 'ENQUEUEHYPERVISORSETROUTE', 'ENQUEUEHYPERVISORGETACTIVEPIPELINES', 'ENQUEUEHYPERVISORREGISTERPIPELINE', 'ENQUEUEHYPERVISORUNREGISTERPIPELINE', 'ENQUEUEHYPERVISORSETPROGRAM', 'ENQUEUEHYPERVISORGETPROGRAM', 'ENQUEUEHYPERVISORMARKBOOT', 'ENQUEUEHYPERVISORPING', 'ENQUEUEHYPERVISORACTIVATEACTORS', 'ENQUEUEHYPERVISORBOOTPIPELINE', 'ENQUEUEHYPERVISORSTAGECOMPLETED', 'STARTHYPERVISORACTOR'], owner: 'HYPERVISORACTOR', types: ['load', 'save', 'getenv', 'setenv', 'getlatestenv', 'getrenderhtml', 'setrenderhtml', 'getexecutionstack', 'setexecutionstack', 'getroute', 'setroute', 'getactivepipelines', 'registerpipeline', 'unregisterpipeline', 'setprogram', 'getprogram', 'markboot', 'eventtriggered', 'ping', 'recover', 'activateactors', 'bootpipeline', 'compilestage', 'stagecompleted'] },
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
  var reg = (typeof messageregistry !== 'undefined') ? messageregistry : null;
  if (!reg) return { ok: false, missing: entry.types };
  var gethandlerfn = reg.gethandler || reg.gethandler;
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    pipelinesmanifest: pipelinesmanifest,
    getroot: getroot,
    checkexistence: checkexistence,
    checkregistration: checkregistration,
    checkstateregistration: checkstateregistration,
    runpipelineboot: runpipelineboot,
    pipelinesbase: pipelinesbase,
    bootpipeline: bootpipeline
  };
}
