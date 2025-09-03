/**
 * Subclass of Foundry's ContextMenu that gets over overflow issues in sheets
 */
export class FloatingContextMenu extends ContextMenu {
    _position = {};
    defaultStyle = {
        'position': 'absolute',
        'z-index': 'var(--z-index-tooltip)',
        'width': 'max-content',
        'min-width': '100px',
        'font-family': 'var(--font-primary)',
        'font-size': 'var(--font-size-14)',
        'box-shadow': '0 0 10px var(--color-border-dark)',
        'cursor': 'pointer'
    };

    /**
     * Stores the pageX / pageY position from the  JQuery event to be applied in `_setPosition`.
     */
    bind() {
        const el = this.element instanceof HTMLElement ? this.element : (this.element?.[0] ?? document.body);
        el.addEventListener(this.eventName, (ev) => {
            const t = ev.target instanceof Element ? ev.target.closest(this.selector) : null;
            if (!t) return;
            ev.preventDefault();
            const { right, bottom } = t.getBoundingClientRect();
            this._position = { left: right, top: bottom };
        });
        super.bind();
    }

    /**
     * Delegate to the parent `_setPosition` then apply the stored position from the callback in `bind`.
     *
     * @param html
     * @param _target
     * @private
     */
    _setPosition(html, _target) {
        const el = html instanceof HTMLElement ? html : (html?.[0] ?? null);
        if (!el) return;
        // Apply default style and fixed positioning
        Object.assign(el.style, this.defaultStyle);
        el.style.position = 'fixed';
        // Calculate final position based on stored anchor and menu width
        const menuWidth = this.menu?.offsetWidth ?? el.offsetWidth ?? 0;
        const left = Math.max(0, (this._position.left ?? 0) - menuWidth);
        const top = Math.max(0, (this._position.top ?? 0));
        el.style.left = `${left}px`;
        el.style.top = `${top}px`;
    }
}