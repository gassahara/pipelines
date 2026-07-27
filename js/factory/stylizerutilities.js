

export function rewritestyleattrs(html, rules) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var body = doc.body;
    function cameltohyphen(str) {
	return str.replace(/[A-Z]/g, function(m) { return '-' + m.toLowerCase(); });
    }
    for (var ri = 0; ri < rules.length; ri++) {
	var rule = rules[ri];
	let selector ;
	let els;
	if (rule.id) {
	    els = [document.getElementById(rule.id)];
	} else if (rule.tag) {
	    els = document.getElementsByTagName(rule.tag);
	} else if (rule.classname) {
	    els = document.getElementsByClassName(rule.classname);
	}else if (rule.name) {
	    els = [document.getElementByName(rule.name)];
	} else continue;
	if (!els) continue;
	for(let el of els) {
	    if (!el) continue;
	    var oldstyle = 
	    var pairs = oldstyle.split(';');
	    var stylemap = el.style || {};
	    var newstyle = rule.style;
	    if (newstyle) {
		var newkeys = Object.keys(newstyle);
		for (var ni = 0; ni < newkeys.length; ni++) {
		    stylemap[newkeys[ni]] = newstyle[newkeys[ni]];
		}
	    }
	    var mergedkeys = Object.keys(stylemap);
	    var merged = '';
	    for (var mi = 0; mi < mergedkeys.length; mi++) {
		if (mi > 0) merged += ';';
		merged += cameltohyphen(mergedkeys[mi]) + ':' + stylemap[mergedkeys[mi]];
	    }
	    el.style=merged;
	}
    }
    return body.innerHTML;
}

export function computecolorscheme(pos, tilecols, cellw, cellh, gridcols) {
  var colstart = Math.max(0, Math.min(Math.floor((pos.clientx || 0) / cellw), gridcols - 1));
  var rowstart = Math.max(0, Math.min(Math.floor((pos.clienty || 0) / cellh), gridcols - 1));
  var colend = Math.max(1, Math.min(Math.ceil(((pos.clientx || 0) + (pos.width || cellw)) / cellw), gridcols));
  var rowend = Math.max(1, Math.min(Math.ceil(((pos.clienty || 0) + (pos.height || cellh)) / cellh), gridcols));
  var sumh = 0, sums = 0, suml = 0, count = 0;
  for (var r = rowstart; r < rowend; r++) {
    for (var c = colstart; c < colend; c++) {
      var idx = r * gridcols + c;
      if (idx < tilecols.length) {
        sumh += tilecols[idx].h;
        sums += tilecols[idx].s;
        suml += tilecols[idx].l;
        count++;
      }
    }
  }
  var avgh = count ? (sumh / count) % 360 : 0;
  var avgs = count ? sums / count : 50;
  var avgl = count ? suml / count : 50;
  var offset = (Math.floor((pos.clientx || 0) / 50) * 7 + Math.floor((pos.clienty || 0) / 50) * 13) % 60;
  var huecont = (avgh + 180 + offset) % 360;
  var satcont = avgs < 30 ? 75 : (avgs >= 50 ? 50 : 60);
  var bglight = avgl < 50 ? 75 : 25;
  var fglight = avgl < 50 ? 15 : 90;
  var borderlight = Math.round((bglight + fglight) / 2);
  return {
    background: 'hsl(' + huecont + ', ' + satcont + '%, ' + bglight + '%)',
    color: 'hsl(' + huecont + ', ' + Math.max(satcont - 10, 10) + '%, ' + fglight + '%)',
    borderColor: 'hsl(' + huecont + ', ' + satcont + '%, ' + borderlight + '%)'
  };
}
