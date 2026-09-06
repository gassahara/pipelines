var shellpipeline = {
  identity: { id: 'shell', type: 'shell', name: 'Shell' },
  libs: [
    { src: 'factory/stylizerutilities.js', provides: ['StylizerCore', 'StylizerRewrite', 'StylizerVerify', 'stylizercore', 'stylizerrewrite', 'stylizerverify'] },
    { src: 'factory/layoutdirectives.js', provides: ['createLayoutDirectives', 'createlayoutdirectives'] },
    { src: 'factory/colorutils.js', provides: ['ColorCore', 'ColorHarmony', 'ColorContrast', 'colorcore', 'colorharmony', 'colorcontrast'] }
  ],
  programs: [
    { src: 'pipelines/sharedhelpers.js', provides: [
        'buildframeworkfunctions', 'buildthemefunctions', 'buildshellfunctions',
        'buildscaffoldfunctions', 'buildnamesfunctions', 'builddescriptionfunctions',
        'buildingredientsfunctions', 'buildastfunctions', 'renderasthtml', 'extractnames',
        'stripmarkdownfences', 'unescapenewlines', 'splitlines', 'containsconfidenceabove50'
      ] },
    { src: 'pipelines/shellhelpers.js', provides: [
        'buildshelldom', 'writefullshell', 'buildhomemenu', 'writehomemenu',
        'buildhomecontent', 'writehomecontent', 'buildmonitorwidget', 'writemonitorwidget',
        'computeinitialwidgetstate', 'computeupdatedwidgetstate', 'computewidgetstyle',
        'computeshellstyles', 'formatminutes'
      ] },
    { src: 'pipelines/themes.js', provides: ['generatethemereference'] },
    { src: 'pipelines/ast.js', provides: ['astrender', 'astextract'] },
    { src: 'pipelines/shellscaffoldstylizer.js', provides: ['applyshelltheme'] },
    { src: 'pipelines/shelllayout.js', provides: ['applyshelllayout'] },
    { src: 'pipelines/homemenustylizer.js', provides: ['homemenustylizer'] },
    { src: 'pipelines/monitorwidgetstylizer.js', provides: ['monitorwidgetstylizer'] },
    { src: 'pipelines/scaffoldwriter.js', provides: ['createscaffoldwriter'] }
  ],
  pipeline: {
    elements: [
      {
        element: 'STAGE',
        id: 'scaffoldshell',
        control: null,
        elements: [
          {
            element: 'BLOCK',
            id: 'buildimportedfunctions',
            type: 'fn',
            inputs: [],
            outputs: {
              frameworkfunctions: 'object',
              themefunctions: 'object',
              shellfunctions: 'object'
            },
            deps: [
              'StylizerCore', 'StylizerRewrite', 'StylizerVerify',
              'createLayoutDirectives', 'ColorCore', 'ColorHarmony', 'ColorContrast',
              'generatethemereference', 'applyshelltheme', 'applyshelllayout',
              'DOMParser', 'buildframeworkfunctions', 'buildthemefunctions', 'buildshellfunctions'
            ],
            fn: function(properties) {
              var deps = properties.deps || {};
              var buildframeworkfn = deps.buildframeworkfunctions || buildframeworkfunctions;
              var buildthemefn = deps.buildthemefunctions || buildthemefunctions;
              var buildshellfn = deps.buildshellfunctions || buildshellfunctions;
              var frameworkfunctions = buildframeworkfn(deps);
              var themefunctions = buildthemefn(deps);
              var shellfunctions = buildshellfn(deps, frameworkfunctions);
              return {
                frameworkfunctions: frameworkfunctions,
                themefunctions: themefunctions,
                shellfunctions: shellfunctions
              };
            }
          },
          {
            element: 'BLOCK',
            id: 'fetchviewport',
            type: 'domquery',
            command: { COMMAND: 'getviewport', properties: {} },
            inputs: [],
            outputs: { currentviewport: 'object' }
          },
          {
            element: 'BLOCK',
            id: 'prepareshelldata',
            type: 'fn',
            inputs: [],
            outputs: { shelldata: 'object' },
            fn: function(properties) {
              return {
                shelldata: {
                  agents: ['yj'],
                  tabs: [{ id: 'yj', name: 'RECIPES' }]
                }
              };
            }
          },
          {
            element: 'BLOCK',
            id: 'initselectedtheme',
            type: 'fn',
            inputs: [],
            outputs: { selectedtheme: 'string' },
            fn: function(properties) {
              return { selectedtheme: 'dark' };
            }
          },
          {
            element: 'BLOCK',
            id: 'shellwriter',
            type: 'writer',
            targetlabel: 'approot',
            replace: true,
            deps: ['writefullshell'],
            inputs: ['frameworkfunctions', 'themefunctions', 'shellfunctions', 'shelldata', 'selectedtheme', 'currentviewport'],
            outputs: { shellwriterobject: 'object' },
            fn: function(properties) {
              var writefn = properties.deps && properties.deps.writefullshell ? properties.deps.writefullshell : writefullshell;
              return writefn(properties);
            }
          },
          {
            element: 'PIPELINE',
            id: 'spawnyj',
            pipeline: 'recipe.pipeline',
            accessors: null,
            sinks: [],
            pipelineIdOverride: 'recipe',
            options: { autorun: true },
            inputs: ['selectedtheme', 'currentviewport'],
            outputs: { yjstatus: 'object' },
            container: 'workspaceyj'
          }
        ]
      },
      {
        element: 'STAGE',
        id: 'renderhome',
        control: null,
        elements: [
          {
            element: 'BLOCK',
            id: 'homemenuwriter',
            type: 'writer',
            targetlabel: 'sidebarnav',
            replace: true,
            deps: ['writehomemenu'],
            inputs: ['shelldata'],
            outputs: { homemenu: 'object' },
            fn: function(properties) {
              var writefn = properties.deps && properties.deps.writehomemenu ? properties.deps.writehomemenu : writehomemenu;
              return writefn(properties);
            }
          },
          {
            element: 'BLOCK',
            id: 'homecontentwriter',
            type: 'writer',
            targetlabel: 'homeroot',
            replace: true,
            deps: ['writehomecontent'],
            inputs: ['shelldata'],
            outputs: {},
            fn: function(properties) {
              var writefn = properties.deps && properties.deps.writehomecontent ? properties.deps.writehomecontent : writehomecontent;
              return writefn(properties);
            }
          }
        ]
      },
      {
        element: 'STAGE',
        id: 'monitorwidgetstage',
        control: null,
        elements: [
          {
            element: 'BLOCK',
            id: 'getutctime',
            type: 'fn',
            inputs: [],
            outputs: { utcnow: 'object' },
            fn: function(properties) {
              var now = new Date();
              return { utcnow: { hour: now.getUTCHours(), minute: now.getUTCMinutes() } };
            }
          },
          {
            element: 'BLOCK',
            id: 'computewidgetstate',
            type: 'fn',
            deps: ['computeinitialwidgetstate'],
            inputs: ['utcnow'],
            outputs: { widgetstate: 'object' },
            fn: function(properties) {
              var computefn = properties.deps && properties.deps.computeinitialwidgetstate ? properties.deps.computeinitialwidgetstate : computeinitialwidgetstate;
              return { widgetstate: computefn(properties.inputs.utcnow) };
            }
          },
          {
            element: 'BLOCK',
            id: 'widgetwriter',
            type: 'writer',
            targetlabel: 'sidebarstatus',
            replace: true,
            deps: ['writemonitorwidget'],
            inputs: ['widgetstate'],
            outputs: { widgetwriterobject: 'object' },
            fn: function(properties) {
              var writefn = properties.deps && properties.deps.writemonitorwidget ? properties.deps.writemonitorwidget : writemonitorwidget;
              return writefn(properties);
            }
          }
        ]
      },
      {
        element: 'STAGE',
        id: 'widgetupdatestage',
        control: null,
        elements: [
          {
            element: 'BLOCK',
            id: 'getutctime2',
            type: 'fn',
            inputs: [],
            outputs: { utcnow: 'object' },
            fn: function(properties) {
              var now = new Date();
              return { utcnow: { hour: now.getUTCHours(), minute: now.getUTCMinutes() } };
            }
          },
          {
            element: 'BLOCK',
            id: 'computewidgetstate2',
            type: 'fn',
            deps: ['computeupdatedwidgetstate'],
            inputs: ['utcnow'],
            outputs: { widgetstate: 'object' },
            fn: function(properties) {
              var computefn = properties.deps && properties.deps.computeupdatedwidgetstate ? properties.deps.computeupdatedwidgetstate : computeupdatedwidgetstate;
              return { widgetstate: computefn(properties.inputs.utcnow) };
            }
          },
          {
            element: 'BLOCK',
            id: 'computewidgetstyle',
            type: 'fn',
            deps: ['computewidgetstyle'],
            inputs: ['widgetstate'],
            outputs: { widgetstyle: 'object' },
            fn: function(properties) {
              var computefn = properties.deps && properties.deps.computewidgetstyle ? properties.deps.computewidgetstyle : computewidgetstyle;
              return { widgetstyle: computefn(properties.inputs.widgetstate) };
            }
          },
          {
            element: 'BLOCK',
            id: 'widgetcolorupdater',
            type: 'domquery',
            command: { COMMAND: 'setstyle', properties: { id: 'monitorwidgetdot', value: 'widgetstyle' } },
            inputs: ['widgetstyle'],
            outputs: {}
          }
        ]
      },
      {
        element: 'STAGE',
        id: 'triggertogglesidebar',
        output: null,
        control: { command: 'EVENT', sourceid: 'sidebartoggle', event: 'click' },
        elements: [
          {
            element: 'BLOCK',
            id: 'togglesidebarclass',
            type: 'domquery',
            command: { COMMAND: 'toggleclass', properties: { id: 'shellsidebar', classname: 'collapsed', force: false } },
            inputs: [],
            outputs: {}
          }
        ]
      },
      {
        element: 'STAGE',
        id: 'triggeryj',
        output: null,
        control: { command: 'EVENT', sourceid: 'tabyj', event: 'click' },
        elements: [
          {
            element: 'BLOCK',
            id: 'triggeryjhidehome',
            type: 'domquery',
            command: { COMMAND: 'setstyle', properties: { id: 'homeroot', value: { display: 'none' } } },
            inputs: [],
            outputs: {}
          },
          {
            element: 'BLOCK',
            id: 'triggeryjshow',
            type: 'domquery',
            command: { COMMAND: 'setstyle', properties: { id: 'workspaceyj', value: { display: 'block' } } },
            inputs: [],
            outputs: {}
          }
        ]
      },
      {
        element: 'STAGE',
        id: 'shellthemechange',
        output: null,
        control: { command: 'EVENT', sourceid: 'themeselect', event: 'change' },
        elements: [
          { element: 'BLOCK', id: 'getshelltheme', type: 'domquery', command: { COMMAND: 'getvalue', properties: { id: 'themeselect' } }, inputs: [], outputs: { selectedtheme: 'string' } },
          { element: 'BLOCK', id: 'fetchviewporttheme', type: 'domquery', command: { COMMAND: 'getviewport', properties: {} }, inputs: [], outputs: { currentviewport: 'object' } },
          { element: 'BLOCK', id: 'setcurrenttheme', type: 'fn', inputs: ['selectedtheme'], outputs: { currenttheme: 'string' }, fn: function(properties) { return { currenttheme: properties.inputs.selectedtheme }; } },
          { element: 'BLOCK', id: 'computeshellstyles', type: 'fn', deps: ['computeshellstyles'], inputs: ['selectedtheme'], outputs: { shellrootstyle: 'object', shellsidebarstyle: 'object', sidebarheaderstyle: 'object', sidebarnavstyle: 'object', sidebarstatusstyle: 'object', sidebartogglestyle: 'object', shellworkspacestyle: 'object' }, fn: function(properties) {
              var computefn = properties.deps && properties.deps.computeshellstyles ? properties.deps.computeshellstyles : computeshellstyles;
              return computefn(properties.inputs.selectedtheme);
          } },
          { element: 'BLOCK', id: 'applyshellrootstyle', type: 'domquery', command: { COMMAND: 'setstyle', properties: { id: 'shellroot', value: 'shellrootstyle' } }, inputs: ['shellrootstyle'], outputs: {} },
          { element: 'BLOCK', id: 'applyshellsidebarstyle', type: 'domquery', command: { COMMAND: 'setstyle', properties: { id: 'shellsidebar', value: 'shellsidebarstyle' } }, inputs: ['shellsidebarstyle'], outputs: {} },
          { element: 'BLOCK', id: 'applysidebarheaderstyle', type: 'domquery', command: { COMMAND: 'setstyle', properties: { id: 'sidebarheader', value: 'sidebarheaderstyle' } }, inputs: ['sidebarheaderstyle'], outputs: {} },
          { element: 'BLOCK', id: 'applysidebarstatusstyle', type: 'domquery', command: { COMMAND: 'setstyle', properties: { id: 'sidebarstatus', value: 'sidebarstatusstyle' } }, inputs: ['sidebarstatusstyle'], outputs: {} },
          { element: 'BLOCK', id: 'applysidebartogglestyle', type: 'domquery', command: { COMMAND: 'setstyle', properties: { id: 'sidebartoggle', value: 'sidebartogglestyle' } }, inputs: ['sidebartogglestyle'], outputs: {} },
          { element: 'BLOCK', id: 'applyshellworkspacestyle', type: 'domquery', command: { COMMAND: 'setstyle', properties: { id: 'shellworkspace', value: 'shellworkspacestyle' } }, inputs: ['shellworkspacestyle'], outputs: {} },
          { element: 'BLOCK', id: 'reapplyshelllayout', type: 'fn', inputs: ['currentviewport', 'selectedtheme'], outputs: {}, fn: function(properties) { return {}; } }
        ]
      },
      {
        element: 'STAGE',
        id: 'focussidebartoggle',
        output: null,
        control: { command: 'EVENT', sourceid: 'sidebartoggle', event: 'focus' },
        elements: [
          {
            element: 'BLOCK',
            id: 'setfocustoggle',
            type: 'domquery',
            command: { COMMAND: 'setstyle', properties: { id: 'sidebartoggle', value: { outline: '2px solid #f59e0b', outlineOffset: '2px' } } },
            inputs: [],
            outputs: {}
          }
        ]
      },
      {
        element: 'STAGE',
        id: 'blursidebartoggle',
        output: null,
        control: { command: 'EVENT', sourceid: 'sidebartoggle', event: 'blur' },
        elements: [
          {
            element: 'BLOCK',
            id: 'removefocustoggle',
            type: 'domquery',
            command: { COMMAND: 'setstyle', properties: { id: 'sidebartoggle', value: { outline: '' } } },
            inputs: [],
            outputs: {}
          }
        ]
      },
      {
        element: 'STAGE',
        id: 'focusthemeselect',
        output: null,
        control: { command: 'EVENT', sourceid: 'themeselect', event: 'focus' },
        elements: [
          {
            element: 'BLOCK',
            id: 'setfocustheme',
            type: 'domquery',
            command: { COMMAND: 'setstyle', properties: { id: 'themeselect', value: { outline: '2px solid #f59e0b', outlineOffset: '2px' } } },
            inputs: [],
            outputs: {}
          }
        ]
      },
      {
        element: 'STAGE',
        id: 'blurthemeselect',
        output: null,
        control: { command: 'EVENT', sourceid: 'themeselect', event: 'blur' },
        elements: [
          {
            element: 'BLOCK',
            id: 'removefocustheme',
            type: 'domquery',
            command: { COMMAND: 'setstyle', properties: { id: 'themeselect', value: { outline: '' } } },
            inputs: [],
            outputs: {}
          }
        ]
      },
      {
        element: 'STAGE',
        id: 'hovertabyj',
        output: null,
        control: { command: 'EVENT', sourceid: 'tabyj', event: 'mouseenter' },
        elements: [
          {
            element: 'BLOCK',
            id: 'hoverontabyj',
            type: 'domquery',
            command: { COMMAND: 'setstyle', properties: { id: 'tabyj', value: { filter: 'brightness(1.1)' } } },
            inputs: [],
            outputs: {}
          }
        ]
      },
      {
        element: 'STAGE',
        id: 'leavetabyj',
        output: null,
        control: { command: 'EVENT', sourceid: 'tabyj', event: 'mouseleave' },
        elements: [
          {
            element: 'BLOCK',
            id: 'hoverofftabyj',
            type: 'domquery',
            command: { COMMAND: 'setstyle', properties: { id: 'tabyj', value: { filter: 'none' } } },
            inputs: [],
            outputs: {}
          }
        ]
      }
    ]
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    shellpipeline: shellpipeline
  };
}

