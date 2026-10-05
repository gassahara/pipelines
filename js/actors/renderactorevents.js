function LCISINTENTIONALCLIP(EL) {
  if (!EL || !EL.style) return false;
  var ov = EL.style.overflow;
  if (ov === 'hidden' || ov === 'clip') return true;
  return false;
}

function CREATEEVENTPRODUCERCONSUMER(MSG) {
  return {
    PRODUCER: { TYPE: 'domevent', ID: MSG.SOURCEID, EVENT: MSG.EVENT },
    CONSUMER: { TYPE: 'eventtrigger', PIPELINEID: MSG.PIPELINEID, STAGEID: MSG.STAGEID },
    METADATA: {
      STAGEPATH: MSG.STAGEPATH || [],
      CONTROL: MSG.CONTROL,
      CHILDREN: MSG.ELEMENTS,
      STAGE: MSG.STAGE,
      ENV: MSG.ENV || {},
      OPTIONS: MSG.OPTIONS || {}
    }
  };
}

function SCHEDULEGCCYCLE(RENDERSLICE) {
  if (!RENDERSLICE) return;
  if (RENDERSLICE.TRIGGERGCSCHEDULED) return;
  RENDERSLICE.TRIGGERGCSCHEDULED = true;
  setTimeout(function() {
    RENDERSLICE.TRIGGERGCSCHEDULED = false;
    var GC = RENDERSLICE.GC;
    if (GC) {
      if (typeof COLLECTENDED === 'function') COLLECTENDED(GC);
    }
  }, 0);
}

function ENSUREEVENTOBSERVER(RENDERSLICE) {
  if (!RENDERSLICE || RENDERSLICE.TRIGGEROBSERVERINSTALLED) return;
  if (typeof document === 'undefined') return;
  RENDERSLICE.TRIGGEROBSERVERINSTALLED = true;
  loginfo(RENDERSLICE, '[RENDERACTOR]', 'INSTALLING GLOBAL DOM EVENT OBSERVER FOR EVENT STAGES');

  var HANDLER = function(EVENT) {
    var TARGET = EVENT.target;
    var TARGETID = TARGET && TARGET.id;
    var GC = RENDERSLICE.GC;
    if (!TARGETID || !GC) return;

    var LISTFN = (typeof LISTOBJECTS === 'function') ? LISTOBJECTS : function() { return []; };
    var INCSENTFN = (typeof INCREMENTSENT === 'function') ? INCREMENTSENT : function() {};
    var MATCHINGOBJECTS = LISTFN(GC).filter(function(GCOBJ) {
      var PRODUCER = GCOBJ.PRODUCER || {};
      return (PRODUCER.TYPE === 'domevent' || PRODUCER.TYPE === 'dom-event') &&
             PRODUCER.ID === TARGETID &&
             PRODUCER.EVENT === EVENT.type;
    });

    if (MATCHINGOBJECTS.length === 0) return;

    var FIRSTCONSUMER = MATCHINGOBJECTS[0].CONSUMER || {};
    loginfo(RENDERSLICE, '[RENDERACTOR]', 'EVENT OBSERVED:', {
      SOURCEID: TARGETID,
      EVENT: EVENT.type,
      PIPELINEID: FIRSTCONSUMER.PIPELINEID,
      STAGEID: FIRSTCONSUMER.STAGEID
    });

    MATCHINGOBJECTS.forEach(function(GCOBJ) {
      INCSENTFN(GC, GCOBJ.ID, 1);

      var CONSUMER = GCOBJ.CONSUMER || {};
      var METADATA = GCOBJ.METADATA || {};
      var PIPELINEID = CONSUMER.PIPELINEID;
      var STAGEID = CONSUMER.STAGEID;
      var STAGEPATH = METADATA.STAGEPATH || [STAGEID];

      var EVENTTRIGGERPAYLOAD = {
        PIPELINEID: PIPELINEID,
        STAGEID: STAGEID,
        STAGEPATH: STAGEPATH,
        EVENTPAYLOAD: { TYPE: EVENT.type, TARGETID: TARGETID },
        STAGE: METADATA.STAGE,
        ENV: METADATA.ENV,
        OPTIONS: METADATA.OPTIONS
      };

      var MSGTYPE = 'EVENTTRIGGERED';
      SENDINSTRUCTION('HYPERVISORACTOR', MSGTYPE, EVENTTRIGGERPAYLOAD, null, 'RENDERACTOR');

      logdebug(RENDERSLICE, '[RENDERACTOR]', 'EVENTTRIGGERED SENT TO HYPERVISORACTOR FOR', STAGEID);
    });
  };

  document.addEventListener('click', HANDLER, true);
  document.addEventListener('input', HANDLER, true);
  document.addEventListener('change', HANDLER, true);
  loginfo(RENDERSLICE, '[RENDERACTOR]', 'GLOBAL EVENT OBSERVER INSTALLED FOR CLICK/INPUT/CHANGE');
}
