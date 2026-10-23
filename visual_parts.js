var SVG_NS = 'http://www.w3.org/2000/svg';
var svgSeq = 0;

function lighten(hex, k) {
    var n = parseInt(hex.slice(1), 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.round(r + (255 - r) * k);
    g = Math.round(g + (255 - g) * k);
    b = Math.round(b + (255 - b) * k);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

function darken(hex, k) {
    var n = parseInt(hex.slice(1), 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.round(r * (1 - k)); g = Math.round(g * (1 - k)); b = Math.round(b * (1 - k));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

function svgEl(tag) { return document.createElementNS(SVG_NS, tag); }

function shapePath(id) {
    if (id === 'circle') return 'M50 11a39 39 0 100 78 39 39 0 000-78z';
    if (id === 'square') return 'M29 13h42a16 16 0 0116 16v42a16 16 0 01-16 16H29a16 16 0 01-16-16V29a16 16 0 0116-16z';
    if (id === 'rectangle') return 'M18 27h64a10 10 0 0110 10v26a10 10 0 01-10 10H18a10 10 0 01-10-10V37a10 10 0 0110-10z';
    // 三角：三个角都用二次曲线倒圆
    return 'M50 12c4 0 7 2 9 6l29 52c3 6 0 13-7 13H19c-7 0-10-7-7-13l29-52c2-4 5-6 9-6z';
  }

function shapeSvg(id, color, cls) {
    var uid = 'sh' + (++svgSeq);
    var svg = svgEl('svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('class', 'shape-svg' + (cls ? ' ' + cls : ''));
    svg.dataset.shape = id;

    var defs = svgEl('defs');
    var g1 = svgEl('linearGradient');
    g1.setAttribute('id', uid + 'a');
    g1.setAttribute('x1', '0'); g1.setAttribute('y1', '0');
    g1.setAttribute('x2', '0.35'); g1.setAttribute('y2', '1');
    g1.innerHTML = '<stop offset="0" stop-color="' + lighten(color, 0.34) + '"/>' +
      '<stop offset="0.55" stop-color="' + color + '"/>' +
      '<stop offset="1" stop-color="' + darken(color, 0.12) + '"/>';
    defs.appendChild(g1);

    var g2 = svgEl('radialGradient');
    g2.setAttribute('id', uid + 'b');
    g2.setAttribute('cx', '0.3'); g2.setAttribute('cy', '0.24');
    g2.setAttribute('r', '0.5');
    g2.innerHTML = '<stop offset="0" stop-color="#ffffff" stop-opacity="0.9"/>' +
      '<stop offset="1" stop-color="#ffffff" stop-opacity="0"/>';
    defs.appendChild(g2);
    svg.appendChild(defs);

    var d = shapePath(id);
    var body = svgEl('path');
    body.setAttribute('d', d);
    body.setAttribute('fill', 'url(#' + uid + 'a)');
    svg.appendChild(body);

    var gloss = svgEl('path');
    gloss.setAttribute('d', d);
    gloss.setAttribute('fill', 'url(#' + uid + 'b)');
    svg.appendChild(gloss);

    return svg;
  }

function objectSvg(shapeId, color) {
    var uid = 'ob' + (++svgSeq);
    var svg = svgEl('svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('class', 'shape-svg obj-svg');
    svg.dataset.shape = shapeId;

    var defs = svgEl('defs');
    var g1 = svgEl('radialGradient');
    g1.setAttribute('id', uid + 'g');
    g1.setAttribute('cx', '0.32'); g1.setAttribute('cy', '0.26');
    g1.setAttribute('r', '0.72');
    g1.innerHTML = '<stop offset="0" stop-color="#ffffff" stop-opacity="0.55"/>' +
      '<stop offset="1" stop-color="#ffffff" stop-opacity="0"/>';
    defs.appendChild(g1);
    svg.appendChild(defs);

    var art = svgEl('g');
    if (shapeId === 'circle') {
      // 披萨：饼皮 + 芝士 + 香肠
      art.innerHTML =
        '<circle cx="50" cy="50" r="42" fill="#E0A24C"/>' +
        '<circle cx="50" cy="50" r="36" fill="#F6C56E"/>' +
        '<circle cx="50" cy="50" r="33" fill="#FBD489"/>' +
        '<circle cx="37" cy="38" r="6.4" fill="#D6553F"/>' +
        '<circle cx="62" cy="41" r="6" fill="#D6553F"/>' +
        '<circle cx="44" cy="62" r="6.2" fill="#D6553F"/>' +
        '<circle cx="66" cy="61" r="5.6" fill="#D6553F"/>' +
        '<circle cx="54" cy="51" r="5" fill="#D6553F"/>';
    } else if (shapeId === 'square') {
      // 窗户：木框 + 玻璃 + 十字格
      art.innerHTML =
        '<rect x="13" y="13" width="74" height="74" rx="12" fill="#B97C48"/>' +
        '<rect x="19" y="19" width="62" height="62" rx="8" fill="#9ED3F2"/>' +
        '<rect x="19" y="19" width="62" height="62" rx="8" fill="none" stroke="#B97C48" stroke-width="0"/>' +
        '<path d="M50 19v62M19 50h62" stroke="#B97C48" stroke-width="7" stroke-linecap="round"/>' +
        '<path d="M24 27l14-6" stroke="#ffffff" stroke-opacity=".75" stroke-width="5" stroke-linecap="round"/>';
    } else if (shapeId === 'rectangle') {
      // 门：长方形木门 + 门把手
      art.innerHTML =
        '<rect x="24" y="12" width="52" height="76" rx="10" fill="#B97C48"/>' +
        '<rect x="29" y="17" width="42" height="66" rx="7" fill="#D79A62"/>' +
        '<rect x="29" y="17" width="42" height="20" rx="7" fill="#E5B183" opacity=".7"/>' +
        '<circle cx="63" cy="54" r="4.6" fill="#F6D98A"/>' +
        '<rect x="33" y="30" width="34" height="3.6" rx="1.8" fill="#C98B4B" opacity=".55"/>' +
        '<rect x="33" y="62" width="34" height="3.6" rx="1.8" fill="#C98B4B" opacity=".55"/>';
    } else {
      // 西瓜片：绿皮 + 红瓤 + 籽
      art.innerHTML =
        '<path d="M50 12c4 0 7 2 9 6l29 52c3 6 0 13-7 13H19c-7 0-10-7-7-13l29-52c2-4 5-6 9-6z" fill="#4EA35B"/>' +
        '<path d="M50 25c3 0 5 1 6 4l22 39c2 4 0 8-5 8H27c-5 0-7-4-5-8l22-39c1-3 3-4 6-4z" fill="#EE5F58"/>' +
        '<ellipse cx="41" cy="55" rx="3" ry="4.6" fill="#4A2C2A" transform="rotate(-16 41 55)"/>' +
        '<ellipse cx="57" cy="52" rx="3" ry="4.6" fill="#4A2C2A" transform="rotate(14 57 52)"/>' +
        '<ellipse cx="52" cy="66" rx="3" ry="4.4" fill="#4A2C2A"/>';
    }
    svg.appendChild(art);

    var gloss = svgEl('path');
    gloss.setAttribute('d', 'M0 0h100v100H0z');
    gloss.setAttribute('fill', 'url(#' + uid + 'g)');
    svg.appendChild(gloss);
    return svg;
  }

function houseSvg() {
    var svg = svgEl('svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('class', 'house-svg');

    var roof = svgEl('g');
    roof.setAttribute('class', 'house-part');
    roof.dataset.part = 'triangle';
    roof.innerHTML = '<path d="M50 8c3 0 5 1 7 4l26 40c3 5-1 9-6 9H23c-5 0-9-4-6-9l26-40c2-3 4-4 7-4z" fill="#E2664F"/>' +
      '<path d="M50 8c3 0 5 1 7 4l6 9H37l6-9c2-3 4-4 7-4z" fill="#F08A73" opacity=".7"/>';
    svg.appendChild(roof);

    var wall = svgEl('g');
    wall.setAttribute('class', 'house-part');
    wall.dataset.part = 'square';
    wall.innerHTML = '<rect x="22" y="56" width="56" height="36" rx="7" fill="#F0C98C"/>' +
      '<rect x="22" y="56" width="56" height="10" rx="5" fill="#FADFAE" opacity=".85"/>';
    svg.appendChild(wall);

    var win = svgEl('g');
    win.setAttribute('class', 'house-part');
    win.dataset.part = 'circle';
    win.innerHTML = '<circle cx="58" cy="70" r="8.5" fill="#8FC9EC"/>' +
      '<circle cx="55.4" cy="67.4" r="2.8" fill="#ffffff" opacity=".65"/>';
    svg.appendChild(win);

    // 长方形门：让「Find the rectangle」也有对应的部件可以点亮
    var door = svgEl('g');
    door.setAttribute('class', 'house-part');
    door.dataset.part = 'rectangle';
    door.innerHTML = '<rect x="29" y="73" width="14" height="19" rx="3.5" fill="#B97C48"/>' +
      '<circle cx="40" cy="82.5" r="1.7" fill="#F6D98A"/>';
    svg.appendChild(door);

    return svg;
  }

function lsObjectSVG(obj, cmp) {
    var long = cmp === 'long';
    if (obj === 'snake') {
      if (long) {
        return '<path d="M10 66 C 22 44, 34 44, 44 62 C 52 76, 64 76, 72 60 C 78 48, 86 48, 90 58" ' +
          'fill="none" stroke="#73c46a" stroke-width="13" stroke-linecap="round"/>' +
          '<circle cx="90" cy="58" r="11" fill="#73c46a"/>' +
          '<circle cx="86" cy="54" r="2.4" fill="#22371f"/><circle cx="94" cy="54" r="2.4" fill="#22371f"/>' +
          '<path d="M98 58 l7 -3 -7 -3 z" fill="#e8607a"/>';
      }
      return '<path d="M30 64 C 42 50, 54 50, 60 62 C 64 70, 74 70, 78 60" ' +
        'fill="none" stroke="#73c46a" stroke-width="13" stroke-linecap="round"/>' +
        '<circle cx="78" cy="60" r="10" fill="#73c46a"/>' +
        '<circle cx="74" cy="56" r="2.2" fill="#22371f"/><circle cx="82" cy="56" r="2.2" fill="#22371f"/>' +
        '<path d="M86 60 l6 -3 -6 -3 z" fill="#e8607a"/>';
    }
    if (obj === 'rope') {
      if (long) {
        return '<rect x="12" y="44" width="76" height="14" rx="7" fill="#d8a86a"/>' +
          '<path d="M16 51 l8 -7 M28 51 l8 -7 M40 51 l8 -7 M52 51 l8 -7 M64 51 l8 -7 M76 51 l8 -7" ' +
          'stroke="#b9863f" stroke-width="3" stroke-linecap="round"/>' +
          '<circle cx="12" cy="51" r="8" fill="#b9863f"/><circle cx="88" cy="51" r="8" fill="#b9863f"/>';
      }
      return '<rect x="34" y="46" width="32" height="13" rx="6.5" fill="#d8a86a"/>' +
        '<path d="M38 52 l6 -6 M48 52 l6 -6 M58 52 l6 -6" stroke="#b9863f" stroke-width="3" stroke-linecap="round"/>' +
        '<circle cx="34" cy="52" r="6.5" fill="#b9863f"/><circle cx="66" cy="52" r="6.5" fill="#b9863f"/>';
    }
    if (obj === 'pencil') {
      if (long) {
        return '<rect x="14" y="44" width="58" height="14" rx="3" fill="#f3c64d"/>' +
          '<rect x="14" y="44" width="58" height="5" fill="#ffe08a"/>' +
          '<path d="M72 44 l14 7 -14 7 z" fill="#e9c39a"/><path d="M80 51 l6 -4 v8 z" fill="#3a3a3a"/>' +
          '<rect x="8" y="44" width="8" height="14" rx="3" fill="#e8607a"/><rect x="8" y="44" width="3" height="14" fill="#caa6a6"/>';
      }
      return '<rect x="34" y="46" width="30" height="12" rx="3" fill="#f3c64d"/>' +
        '<path d="M64 46 l9 6 -9 6 z" fill="#e9c39a"/><path d="M70 52 l5 -3.5 v7 z" fill="#3a3a3a"/>';
    }
    if (obj === 'bread') {
      if (long) {
        return '<rect x="12" y="42" width="76" height="20" rx="10" fill="#e0a955"/>' +
          '<rect x="12" y="42" width="76" height="7" rx="6" fill="#efc378"/>' +
          '<path d="M26 52 l8 -6 M40 52 l8 -6 M54 52 l8 -6 M68 52 l8 -6" stroke="#c98f3c" stroke-width="2.4" stroke-linecap="round"/>';
      }
      return '<circle cx="50" cy="52" r="20" fill="#e0a955"/>' +
        '<circle cx="50" cy="52" r="20" fill="none" stroke="#efc378" stroke-width="5"/>' +
        '<path d="M40 50 q10 8 20 0" stroke="#c98f3c" stroke-width="2.4" fill="none" stroke-linecap="round"/>';
    }
    if (obj === 'scarf') {
      if (long) {
        return '<path d="M22 38 C 40 36, 60 36, 78 38 L 76 50 C 60 48, 40 48, 24 50 Z" fill="#e8607a"/>' +
          '<rect x="20" y="50" width="10" height="34" rx="4" fill="#e8607a"/>' +
          '<rect x="70" y="50" width="10" height="34" rx="4" fill="#e8607a"/>' +
          '<path d="M20 50 l10 0 -2 34 -6 0 z" fill="#c9476a"/>';
      }
      return '<path d="M36 44 C 46 42, 54 42, 64 44 L 63 52 C 54 50, 46 50, 37 52 Z" fill="#e8607a"/>' +
        '<rect x="35" y="52" width="7" height="18" rx="3" fill="#e8607a"/>' +
        '<rect x="58" y="52" width="7" height="18" rx="3" fill="#e8607a"/>';
    }
    if (obj === 'car') {
      if (long) {
        return '<rect x="12" y="46" width="76" height="20" rx="10" fill="#5aa9e6"/>' +
          '<path d="M30 46 q10 -16 22 -16 h16 q12 0 14 16 z" fill="#7cc0f0"/>' +
          '<rect x="36" y="34" width="20" height="12" rx="3" fill="#dff2ff"/>' +
          '<circle cx="30" cy="68" r="9" fill="#2f3a45"/><circle cx="30" cy="68" r="4" fill="#9fb0bd"/>' +
          '<circle cx="70" cy="68" r="9" fill="#2f3a45"/><circle cx="70" cy="68" r="4" fill="#9fb0bd"/>';
      }
      return '<rect x="30" y="48" width="40" height="18" rx="9" fill="#5aa9e6"/>' +
        '<path d="M38 48 q6 -12 14 -12 h6 q8 0 8 12 z" fill="#7cc0f0"/>' +
        '<rect x="42" y="38" width="14" height="10" rx="3" fill="#dff2ff"/>' +
        '<circle cx="40" cy="66" r="7" fill="#2f3a45"/><circle cx="60" cy="66" r="7" fill="#2f3a45"/>';
    }
    if (obj === 'banana') {
      if (long) {
        return '<path d="M20 40 C 30 70, 60 78, 82 64 C 70 72, 44 70, 30 48 C 26 42, 22 40, 20 40 Z" fill="#f4d03f"/>' +
          '<path d="M20 40 C 30 70, 60 78, 82 64" fill="none" stroke="#e0b62e" stroke-width="3"/>' +
          '<rect x="17" y="36" width="6" height="6" rx="2" fill="#6b4a2b"/>';
      }
      return '<path d="M38 50 C 44 66, 62 70, 72 60 C 62 66, 48 64, 42 52 C 40 50, 38 50, 38 50 Z" fill="#f4d03f"/>' +
        '<rect x="35" y="47" width="5" height="5" rx="2" fill="#6b4a2b"/>';
    }
    return '';
  }

function lsAnimalSVG(id) {
    if (id === 'giraffe') {
      return '<rect x="40" y="50" width="12" height="34" rx="5" fill="#f2c14e"/>' +
        '<ellipse cx="46" cy="56" rx="20" ry="14" fill="#f2c14e"/>' +
        '<rect x="44" y="22" width="9" height="34" rx="4" fill="#f2c14e"/>' +
        '<ellipse cx="48" cy="20" rx="9" ry="7" fill="#f2c14e"/>' +
        '<rect x="44" y="12" width="3" height="8" rx="1.5" fill="#b8862f"/>' +
        '<circle cx="45.5" cy="11" r="3" fill="#8a5a22"/>' +
        '<circle cx="51" cy="19" r="1.8" fill="#3a2a16"/>' +
        '<rect x="55" y="18" width="6" height="3" rx="1.5" fill="#e8a86a"/>' +
        '<circle cx="38" cy="50" r="4" fill="#caa23a"/><circle cx="50" cy="48" r="4" fill="#caa23a"/>' +
        '<circle cx="42" cy="64" r="4" fill="#caa23a"/>';
    }
    if (id === 'rabbit') {
      return '<ellipse cx="50" cy="64" rx="20" ry="18" fill="#f4f0ea"/>' +
        '<circle cx="50" cy="42" r="14" fill="#f4f0ea"/>' +
        '<ellipse cx="44" cy="22" rx="5" ry="16" fill="#f4f0ea"/><ellipse cx="56" cy="22" rx="5" ry="16" fill="#f4f0ea"/>' +
        '<ellipse cx="44" cy="22" rx="2.4" ry="12" fill="#f4c4cf"/><ellipse cx="56" cy="22" rx="2.4" ry="12" fill="#f4c4cf"/>' +
        '<circle cx="45" cy="42" r="2.4" fill="#3a2a22"/><circle cx="55" cy="42" r="2.4" fill="#3a2a22"/>' +
        '<circle cx="50" cy="48" r="2.6" fill="#e88aa0"/>' +
        '<circle cx="34" cy="62" r="6" fill="#f4f0ea"/>';
    }
    // turtle：矮小结实，与「长」形成对比
    return '<ellipse cx="50" cy="58" rx="26" ry="18" fill="#7bbf6a"/>' +
      '<path d="M50 40 v36 M30 50 q20 -6 40 0 M30 66 q20 6 40 0" stroke="#4f8a45" stroke-width="2.4" fill="none"/>' +
      '<circle cx="30" cy="58" r="13" fill="#8fd07e"/>' +
      '<circle cx="27" cy="55" r="2.2" fill="#2f3a22"/>' +
      '<rect x="44" y="74" width="8" height="8" rx="3" fill="#6aa85a"/><rect x="58" y="74" width="8" height="8" rx="3" fill="#6aa85a"/>';
  }

function vpShapeSvg(id, color) { return shapeSvg(id, color); }
function vpObjectSvg(id, color) { return objectSvg(id, color); }
function vpHouseSvg() { return houseSvg(); }
function vpLsObjectSvg(obj, cmp) {
  var s = '<svg viewBox="0 0 100 100" class="vp-ls-svg">' + lsObjectSVG(obj, cmp) + '</svg>';
  return s;
}
function vpLsAnimalSvg(id) {
  var s = '<svg viewBox="0 0 100 100" class="vp-ls-svg">' + lsAnimalSVG(id) + '</svg>';
  return s;
}
