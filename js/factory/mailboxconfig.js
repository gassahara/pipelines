// js/factory/mailboxconfig.js — mailbox timeout and interval configuration.
//
// @proposal=P-YJ-MAILBOX-CONFIG (Cycle AR-FC-15) — introduces a single
// frozen defaults object (MAILBOXCONFIG) plus one resolver
// (mailboxresolve) and two optional override appliers
// (bootloadermailboxconfig, appinitmailboxconfig).
//
// Every consumer of a timeout or interval reads it at CALL TIME from
// mailboxresolve(field), which applies the precedence chain:
//
//     window.APPINIT<FIELD>     — set by ./appinit.js, if provided
//       ↓ else
//     window.BOOTLOADER<FIELD>  — set by ./js/bootloader.js, if provided
//       ↓ else
//     MAILBOXCONFIG.<field>     — the frozen default
//
// where <FIELD> is the uppercase form of the field name (no separators).
// The overrides must be positive numbers; anything else is ignored and
// the chain falls through.
//
// This file is loaded first in the framework manifest so that
// mailboxresolve is available to every consumer (mailactor,
// blockcompiler, dbactor) before any of them run.

var MAILBOXCONFIG = Object.freeze({
    expectationtimeout: 20000,
    pollinterval: 150,
    mailboxwaittimeout: 25000,
    scriptwitnesstimeout: 5000,
    storewaittimeout: 20000
});

var MAILBOXCONFIGFIELDORDER = [
    'expectationtimeout',
    'pollinterval',
    'mailboxwaittimeout',
    'scriptwitnesstimeout',
    'storewaittimeout'
];

function mailboxresolve(field) {
    if (typeof field !== 'string') {
        throw new Error('[mailboxresolve] field name must be a string');
    }
    if (MAILBOXCONFIG[field] === undefined) {
        throw new Error('[mailboxresolve] unknown field: ' + field);
    }
    var uppersuffix = field.toUpperCase();
    if (typeof window !== 'undefined') {
        var appinitkey = 'APPINIT' + uppersuffix;
        var bootloaderkey = 'BOOTLOADER' + uppersuffix;
        var av = window[appinitkey];
        if (typeof av === 'number' && isFinite(av) && av > 0) return av;
        var bv = window[bootloaderkey];
        if (typeof bv === 'number' && isFinite(bv) && bv > 0) return bv;
    }
    return MAILBOXCONFIG[field];
}

function bootloadermailboxconfig(cfg) {
    if (!cfg || typeof cfg !== 'object') return;
    if (typeof window === 'undefined') return;
    MAILBOXCONFIGFIELDORDER.forEach(function(field) {
        var v = cfg[field];
        if (typeof v === 'number' && isFinite(v) && v > 0) {
            window['BOOTLOADER' + field.toUpperCase()] = v;
        }
    });
}

function appinitmailboxconfig(cfg) {
    if (!cfg || typeof cfg !== 'object') return;
    if (typeof window === 'undefined') return;
    MAILBOXCONFIGFIELDORDER.forEach(function(field) {
        var v = cfg[field];
        if (typeof v === 'number' && isFinite(v) && v > 0) {
            window['APPINIT' + field.toUpperCase()] = v;
        }
    });
}
