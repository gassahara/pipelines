// ---- OP-018: RESTORED MODULE (SCOPE-SFP-002) ----
// The bootloader manifest declares this file and its three globals:
//     js/bootloader.js#L28  { src: 'factory/domqueryconstants.js',
//                             provides: ['domquerygetters', 'domquerysetters', 'domquerymessages'] }
// but the file was ABSENT from the tree, so all three globals were undefined. js/typesystem.js — a loaded
// framework file — dereferences two of them, which made validatedomqueryblock() throw ReferenceError:
//     typesystem.js#L337   var all = domquerymessages.concat(['getviewport', 'getscreen', 'matchmedia']);
//     typesystem.js#L343   if (domquerysetters.indexOf(cmd) !== -1) { … }
//
// CONTENTS ARE DERIVED, NOT INVENTED. The authority for what a domquery block may contain is the compiler's own
// dispatch switch, which accepts fifteen commands and throws on anything else:
//     js/factory/blockcompiler.js#L403-L417   (fifteen `case` labels)
//     js/factory/blockcompiler.js#L418        default: throw new Error('[DOMQUERY] unknown COMMAND: ' + cmd)
// The three lists partition that set so that typesystem's two uses agree exactly:
//     domquerymessages ∪ {getviewport, getscreen, matchmedia}  ==  the compiler's full command set (15)
//     domquerysetters ⊂ domquerymessages, and holds exactly the commands that carry a `value`
//         (toggleclass excepted: it carries `classname` — the rules typesystem enforces at #L344-L345)
// Membership therefore has no free choice: every accepted command appears once, viewport/screen/media on the
// read side only, and `property` is a message command rather than a setter because it takes `arguments`, not a
// value.

var domquerygetters = Object.freeze([
  'gethtml', 'getvalue', 'getstyle', 'getposition', 'getlayout',
  'getviewport', 'getscreen', 'matchmedia'
]);

var domquerysetters = Object.freeze([
  'sethtml', 'setposition', 'setstyle', 'setvalue', 'setlayout', 'toggleclass'
]);

var domquerymessages = Object.freeze([
  'gethtml', 'getvalue', 'getstyle', 'getposition', 'getlayout',
  'sethtml', 'setposition', 'setstyle', 'setvalue', 'setlayout', 'toggleclass', 'property'
]);