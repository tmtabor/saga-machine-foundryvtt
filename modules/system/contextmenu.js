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
        this.element.on(this.eventName, this.selector, (event) => {
            event.preventDefault();
            const { right, bottom } = event.currentTarget.getBoundingClientRect();
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
        const target = $('body');
        super._setPosition(html, target);
        target.css('position', 'fixed');
        html.css(this.defaultStyle); //apply the default style
        this._position.left -= this.menu.width() ?? 0; //calculate the final position
        html.css(this._position); //set the absolute position
    }
}