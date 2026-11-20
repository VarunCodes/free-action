// What the html`…` tag, raw() and when() promise (src/html.js). Run with `npm run test:unit`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { html, raw, when, input } from '../../src/html.js';

const text = markup => String(markup);

test('values are escaped', () => {
    const name = '<b>"Bad" & Co</b>';
    const escaped = '&lt;b&gt;&quot;Bad&quot; &amp; Co&lt;/b&gt;';
    assert.equal(text(html`<span title="${name}">${name}</span>`), `<span title="${escaped}">${escaped}</span>`);
});

test('html nested in html is not escaped twice', () => {
    const inner = html`<i>${'a & b'}</i>`;
    assert.equal(text(html`<b>${inner}</b>`), '<b><i>a &amp; b</i></b>');
});

test('raw() puts markup in as it is', () => {
    assert.equal(text(html`<p>${raw('<em>safe</em>')}</p>`), '<p><em>safe</em></p>');
});

test('a list puts its items in one after another', () => {
    const items = ['a', 'b'].map(letter => html`<li>${letter}</li>`);
    assert.equal(text(html`<ul>${items}</ul>`), '<ul><li>a</li><li>b</li></ul>');
});

test('null and undefined put in nothing; numbers, true and false print as text', () => {
    assert.equal(text(html`[${null}][${undefined}]`), '[][]');
    assert.equal(text(html`<b>${0}</b><b aria-pressed="${true}"></b><b aria-pressed="${false}"></b>`),
        '<b>0</b><b aria-pressed="true"></b><b aria-pressed="false"></b>');
});

test('when() gives the markup only if the condition holds', () => {
    assert.equal(text(html`<b${when(true, html` class="on"`)}></b>`), '<b class="on"></b>');
    assert.equal(text(html`<b${when(false, html` class="on"`)}></b>`), '<b></b>');
    assert.equal(text(html`<b>${when(0, 'zero')}</b>`), '<b></b>');
});

test('an attribute written as a plain string is escaped, so attributes are written with html', () => {
    assert.equal(text(html`<b ${'class="on"'}></b>`), '<b class=&quot;on&quot;></b>');
    assert.equal(text(html`<b ${html`class="on"`}></b>`), '<b class="on"></b>');
});

test('when() only builds the markup from a function if the condition holds', () => {
    const missing = undefined;
    assert.equal(text(html`<b>${when(missing, () => missing.name)}</b>`), '<b></b>');
    assert.equal(text(html`<b>${when({ name: 'Ring' }, () => 'Ring')}</b>`), '<b>Ring</b>');
});

test('line breaks between tags are dropped', () => {
    const markup = html`
        <div>
            <span>a</span>
            ${html`<span>b</span>`}
        </div>`;
    assert.equal(text(markup), '<div><span>a</span><span>b</span></div>');
});

test('other line breaks become one space, inside a tag or in text', () => {
    const markup = html`<button class="rb"
        data-a="roll">Roll
        again</button>`;
    assert.equal(text(markup), '<button class="rb" data-a="roll">Roll again</button>');
});

test('a space on the same line as an inline element stays', () => {
    assert.equal(text(html`<b>38</b> <button>Use</button>`), '<b>38</b> <button>Use</button>');
});

test('input() escapes its value but keeps the extra attributes as written', () => {
    assert.equal(text(input('hp.max', '5"', 'number', 'min=1 aria-label="Max HP"')),
        '<input id="f-hp-max" data-k="hp.max" type="number" value="5&quot;" min=1 aria-label="Max HP">');
});
