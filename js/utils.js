
export const APIBASE = 'https://vflkhntzwfovnuyccxow.supabase.co/functions/v1';

export function escapehtml(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[&<>'"]/g,
        tag => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        }[tag] || tag)
    );
}

export function markdowntohtml(md) {
    if (!md) return '';
    let html = escapehtml(md);

    html = html.replace(/^### (.*$)/gim, '<h4>$1</h4>');
    html = html.replace(/^## (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^# (.*$)/gim, '<h2>$1</h2>');

    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    html = html.replace(/^\s*[-*+]\s+(.*)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

    const paragraphs = html.split(/\n\s*\n/);
    html = paragraphs.map(p => {
        if (p.startsWith('<h') || p.startsWith('<ul') || p.startsWith('<ol')) return p;
        return '<p>' + p.replace(/\n/g, '<br>') + '</p>';
    }).join('\n');

    return html;
}

export function formataitext(text) {
    if (!text) return '';
    return text
        .split(/\n\n+/)
        .map(para => para.trim())
        .filter(para => para.length > 0)
        .map(para => {
            const content = para.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
            return '<p>' + content.replace(/\n/g, '<br>') + '</p>';
        })
        .join('');
}

import { validate } from './typesystem.js';

export const resolvepath = (path, source) => {
  if (!path || typeof path !== 'string') return source;
  const keys = path.split('.');
  let current = source;
  for (const key of keys) {
    if (current == null || typeof current !== 'object') return null;
    current = current[key];
  }
  return current;
};

export const getprop = (path, source, schemaname = null) => {
    const value = resolvepath(path, source);
    if (schemaname) {
        const result = validate(value, schemaname);
        if (result.tag === 'failure') {
            throw new Error('[TypeSystem] Property "' + path + '" failed validation: ' + result.message);
        }
    }
    return value;
};

import { JUST, NOTHING } from './functorial/maybe.js';

export const getproperty = (obj, prop) =>
  (obj && prop in obj && typeof obj[prop] !== 'function')
    ? JUST(obj[prop])
    : NOTHING();

export const getfunction = (obj, prop) =>
  (obj && typeof obj[prop] === 'function')
    ? JUST(obj[prop])
    : NOTHING();

export const setproperty = (obj, prop, value) => ({
  ...obj,
  [prop]: value
});

export const createnodefromtemplate = (templateobj) => {
    if (!templateobj) return NOTHING();
    
    const { html, tagname = 'div', attributes = {} } = templateobj;
    const container = document.createElement(tagname);
    
    Object.entries(attributes).forEach(([k, v]) => {
        if (k === 'class') {
            container.className = v;
        } else {
            container.setAttribute(k, v);
        }
    });
    
    if (html) container.innerHTML = html;
    return JUST(container);
};
