function loadlocalprogram(entry, done) {
  var s = document.createElement('script');
  var base = (typeof PIPELINES_BASE !== 'undefined') ? PIPELINES_BASE : '';
  s.src = base + entry.src;
  s.onload = function() { done(null); };
  s.onerror = function() { done(new Error('failed to load ' + entry.src)); };
  document.head.appendChild(s);
}

var frontendbase = (typeof window !== 'undefined') ? window.location.origin + '/' : '';
var rootpipelinefile = 'pipelines/shell.js';
var rootpipelineprovides = ['shellpipeline'];

function loadrootpipeline(file, provides, basepath, done) {
  var s = document.createElement('script');
  s.src = basepath + file;

  s.onload = function() {
    var missing = [];
    (provides || []).forEach(function(name) {
      if (typeof window[name] === 'undefined') {
        missing.push(name);
      }
    });

    if (missing.length > 0) {
      done(new Error('Root pipeline script did not provide: ' + missing.join(', ')));
      return;
    }

    done();
  };

  s.onerror = function() {
    done(new Error('failed to load ' + file));
  };

  document.head.appendChild(s);
}

function startapp() {
  return STARTWORLDMAPACTOR()
    .then(function() {
      return new Promise(function(resolve, reject) {
        loadrootpipeline(rootpipelinefile, rootpipelineprovides, frontendbase, function(err) {
          if (err) {
            reject(err);
            return;
          }

          if (typeof shellpipeline === 'undefined') {
            reject(new Error('shellpipeline not defined after loading root pipeline'));
            return;
          }

          var loadfn = (typeof loadpipeline === 'function') ? loadpipeline : loadPipeline;
          loadfn(shellpipeline, 'shell', {
            autorun: true,
            baseenv: {},
            updateworldmap: null,
            verbosity: (typeof getverbosity === 'function') ? getverbosity() : undefined
          });

          console.log('[APPINIT] application initialized. Shell pipeline booting.');
          resolve();
        });
      });
    })
    .catch(function(err) {
      console.error('[APPINIT] application initialization failed:', err);
    });
}

function boot() {
  var bootfn = (typeof bootpipeline === 'function') ? bootpipeline : bootPipeline;
  bootfn(function(result) {
    if (result.ok) {
      console.log('[APPINIT] shared boot succeeded');
      startapp();
    } else {
      console.error('[APPINIT] shared boot failed:', JSON.stringify(result.failures));
    }
  });
}

boot();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    loadlocalprogram: loadlocalprogram,
    loadrootpipeline: loadrootpipeline,
    startapp: startapp,
    boot: boot
  };
}

