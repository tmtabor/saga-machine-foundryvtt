import { test_dialog } from "./tests.js";

/**
 * Extend the basic ActorSheet with some very simple modifications
 * @extends {ActorSheet}
 */
export class SagaMachineActorSheet extends ActorSheet {

	/** @inheritdoc */
	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			classes: ["saga-machine", "sheet", "actor"],
			template: "systems/saga-machine/templates/actor-sheet.html",
			width: 850,
			height: 650,
			tabs: [{navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "basics"}],
			scrollY: [".basics", ".skills", ".traits", ".combat", ".inventory"]
			// dragDrop: [{dragSelector: ".item-list .item", dropSelector: null}]
		});
	}

	/** @inheritdoc */
	getData() {
		const context = super.getData();

		// Filter and sort all item lists for the character
		context.data.system.ambitions = this.items(context, 'ambition', null,
			(a, b) =>  a.system.type > b.system.type ? 1 : -1);
		context.data.system.paths = this.items(context, 'path');
		context.data.system.origins = this.items(context, 'origin');
		context.data.system.skills = this.items(context, 'skill');
		context.data.system.traits = this.items(context, 'trait');
		context.data.system.weaknesses = this.items(context, 'weakness');
		context.data.system.consequences = this.items(context, 'consequence');
		context.data.system.equipment = this.items(context, 'item');
		context.data.system.attacks = this.items(context, 'item', a => a.system.attack.has_attack && a.system.equipped);

		// Calculate progress bar percentages
		if (!context.data.system.scores.health.max) context.data.system.scores.health.percent = 0;
		else context.data.system.scores.health.percent = Math.round((context.data.system.scores.health.value / context.data.system.scores.health.max) * 100)

		return context;
	}

	/** @inheritdoc */
	activateListeners(html) {
		super.activateListeners(html);

		// Everything below here is only needed if the sheet is editable
		if ( !this.isEditable ) return;

		// Item creation
		html.find('.item-create').click(this._onItemCreate.bind(this));

		// Item equipping / unequipping
		html.find('.item-equip').click(ev => {
			const box = $(ev.currentTarget).parents(".item");
			const item = this.actor.items.get(box.data("id"));
			const update = { _id: item.id, 'system.equipped': !item.system.equipped };
			this.actor.updateEmbeddedDocuments("Item", [update] );
		});

		// Item editing
		html.find('.item-edit').click(ev => {
			const box = $(ev.currentTarget).parents(".item");
			const item = this.actor.items.get(box.data("id"));
			item.sheet.render(true);
		});

		// Item deletion
		html.find('.item-delete').click(ev => {
			const box = $(ev.currentTarget).parents(".item");
			const item = this.actor.items.get(box.data("id"));
			item.delete();
			box.slideUp(200, () => this.render(false));
		});

		// Dynamic updating of item rank
		html.find('.item-input').on("change", ev => {
			const box = $(ev.currentTarget).parents(".item");
			const update = { _id: box.data("id"), 'system.rank': Number(ev.currentTarget.value) };
			this.actor.updateEmbeddedDocuments("Item", [update] );
		});

		// Handle custom score toggle, decrement and increment
		html.find('.score').on('contextmenu', event => {
			event.preventDefault();
			const target = $(event.target);
			if (target.hasClass('score-secondary')) this._adjust_score(target, -1);
			else this._toggle_custom(target);
		}).on('click', event => {
			event.preventDefault();
			const target = $(event.target);
			if (target.hasClass('score-secondary')) this._adjust_score(target, 1);
		});

		// Allow rollable labels to open roll dialog
		html.find('.rollable').click(this.on_roll.bind(this));

		// Drag events for macros.
		html.find('.rollable').each((i, li) => {					// Find all items on the character sheet.
			li.setAttribute("draggable", true);	// Add draggable and dragstart listener
			li.addEventListener("dragstart", ev => this._onDragStart(ev), false);
		});
	}

	/**
	 * Attach data to hotbar drag events
	 *
	 * @param event
	 * @private
	 */
	_onDragStart(event) {
		event.currentTarget.dataset['actorId'] = this.actor.id;
		event.dataTransfer.setData("text/plain", JSON.stringify(event.currentTarget.dataset));
	}

	/**
	 * Get all items of the specified type, apply an optional secondary filter and sort (alphabetically by default)
	 *
	 * @param data
	 * @param type
	 * @param filter
	 * @param sort
	 * @returns {*}
	 */
	items(data, type, filter, sort) {
		if (!filter) filter = a => true;
		if (!sort) sort = (a, b) =>  a.name > b.name ? 1 : -1;
		return data.data.items.filter( item => item.type === type && filter(item)).sort(sort);
	}

	_adjust_score(target, mod) {
		const score_name = target.attr('name');
		const score = this._get_score(score_name, []);

		// Make the adjustment
		const update_obj = {};
		update_obj[score_name] = score + mod;
		this.actor.update(update_obj);
	}

	_toggle_custom(element) {
		const input = element.hasClass('score-input') ? element : element.find('.score-input');
		if (!input.length) return;

		const score_name = input.attr('name');
		const score = this._get_score(score_name, ['max', 'value']);
		if (!score) return; // If the score was not found, do nothing

		// Toggle custom value
		input.prop('disabled', !!score.custom);
		const score_custom = this._get_score_custom(score_name);
		const update_obj = {};
		update_obj[score_custom] = !score.custom;
		this.actor.update(update_obj);
	}

	_get_score_custom(score_name) {
		return score_name.substr(0, score_name.lastIndexOf("\.")) + '.custom';
	}

	_get_score(score_name, ignore_array) {
		const path = score_name.split('.');
		let pointer = this.actor;
		for (const p of path) {
			if (pointer && !ignore_array.includes(p)) pointer = pointer[p] ? pointer[p] : null;
			else return pointer;
		}
		return pointer;
	}

	/**
	 * When a roll label is clicked, open the roll dialog
	 *
	 * @param event
	 * @returns {Promise<void>}
	 * @private
	 */
	async on_roll(event) {
		event.preventDefault();
		event.currentTarget.dataset['actorId'] = this.actor.id;
		await test_dialog(event.currentTarget.dataset);
	}

	/**
	 * Create a new item of the specified type
	 *
	 * @param event
	 * @returns {Promise<*>}
	 * @private
	 */
	async _onItemCreate(event) {
		event.preventDefault();

		const type = $(event.currentTarget).data("type");
		const header = event.currentTarget;
		const data = duplicate(header.dataset);		// Grab any data associated with this control.
		const name = `New ${type}`;					// Initialize a default name.
		const itemData = {							// Prepare the item object.
			name: name,
			type: type,
			system: data
		};

		// Finally, create the item!
		return await Item.create(itemData, {parent: this.actor});
	}
}
