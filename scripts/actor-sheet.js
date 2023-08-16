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
		context.data.system.scores.health.percent = Math.round((context.data.system.scores.health.value / context.data.system.scores.health.max) * 100)

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
			const target = $(event.target);
			if (target.hasClass('score-input')) this._toggle_custom(target);
			if (target.hasClass('score-secondary')) this._adjust_score(target, -1);
		}).on('click', event => {
			const target = $(event.target);
			if (target.hasClass('score-secondary')) this._adjust_score(target, 1);
		});

		// Allow rollable labels to open roll dialog
		html.find('.rollable').click(this._onRoll.bind(this));
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

	_toggle_custom(input) {
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
	async _onRoll(event) {
		event.preventDefault();
		this._rollDialog(event.currentTarget.dataset);
	}

	/**
	 * Capitalize the first letter of the string
	 *
	 * @param word
	 * @returns {string}
	 * @private
	 */
	_capitalize(word) {
		return word.charAt(0).toUpperCase() + word.slice(1);
	}

	/**
	 * Generate the Saga Machine label for the test
	 *
	 * @param stat
	 * @param skill
	 * @param tn
	 * @param append_test
	 * @returns {*}
	 * @private
	 */
	_test_syntax(stat, skill, tn, append_test=true) {
		const stat_label = stat ? this._capitalize(stat) : '1d10';
		const skill_label = skill ? `/${skill}` : '';
		const tn_label = tn ? (isNaN(tn) ? ` vs. ${tn}` : `-${tn}`) : '';
		return stat_label + skill_label + tn_label + (append_test ? ' Test' : '');
	}

	/**
	 * Generate the roll string for the test, canceling out boons and banes
	 *
	 * @param boons
	 * @param banes
	 * @returns {string}
	 * @private
	 */
	_dice_roll(boons, banes) {
		// Correct for blank and undefined values
		if (!boons) boons = 0;
		if (!banes) banes = 0;

		const total = boons - banes;
		if (total === 0) return '1d10';
		else if (total > 0) return `${total+1}d10kh1`;
		else return `${total*-1+1}d10kl1`;
	}

	/**
	 * Generate the expanded roll for the test, to be output as a card in chat
	 *
	 * @param results
	 * @returns {string}
	 * @private
	 */
	_dice_html(results) {
		let to_return = '<ol class="dice-rolls">';
		for (let i of results) {
			const discarded = i.discarded ? 'discarded' : '';
			to_return += `<li class="roll die d10 ${discarded}">${i.result}</li>`;
		}

		to_return += '</ol>';
		return to_return;
	}

	/**
	 * Take the roll results and look for pairs, adding them appropriately if there were boons
	 *
	 * @param results
	 * @param boons
	 * @param banes
	 * @returns {{total: *, html: string, pairs: boolean}}
	 * @private
	 */
	_make_pairs(results, boons, banes) {
		let pairs = false;
		if (boons > banes) {
			// Find the highest pair
			const found = [];
			let highest_pair = 0;
			for (let i of results.dice[0].results) {
				if (found.includes(i.result) && i.result > highest_pair) highest_pair = i.result;
				found.push(i.result);
			}

			// Set the total and discards
			if (highest_pair * 2 > results.total) {
				pairs = highest_pair;
				results._total = highest_pair * 2;
				let active = 0;
				for (let i of results.dice[0].results) {
					if (i.result === highest_pair && active < 2) {
						i.discarded = false;
						active++;
					}
					else i.discarded = true;
				}
			}
		}

		return {
			total: results.total,
			pairs: pairs,
			html: this._dice_html(results.dice[0].results)
		}
	}

	/**
	 * Calculate damage from the margin and damage string
	 *
	 * @param margin
	 * @param damage_str
	 * @returns {*}
	 * @private
	 */
	_calc_damage(margin, damage_str) {
		const damage = Function(`'use strict'; return (${damage_str})`)();
		return margin + damage;
	}

	/**
	 * Look up the Defense or Willpower TN of the targeted token
	 *
	 * @param raw_tn
	 * @returns {boolean|number|*}
	 * @private
	 */
	_lookup_tn(raw_tn) {
		if (!isNaN(raw_tn)) return Number(raw_tn);

		const is_defense = raw_tn.toLowerCase() === 'defense';
		const is_willpower = raw_tn.toLowerCase() === 'willpower';
		if (!is_defense && !is_willpower) return false;

		const scores = game?.user?.targets?.values()?.next()?.value?.actor?.system?.scores;
		if (!scores) return false;
		return is_defense ? scores.defense.tn : scores.willpower.tn;
	}

	/**
	 * Calculate the margin of success or failure from the TN and total, also calculate damage if necessary
	 *
	 * @param tn
	 * @param total
	 * @param raw_damage
	 * @returns {{damage: null, margin: number, critical: boolean, success: boolean, message: string}|{message: string}}
	 * @private
	 */
	_calc_margin(tn, total, raw_damage) {
		// Handle unknown TN
		if (!tn) return {
			message: ''
		};

		let margin = total - tn;
		const success = margin >= 0;
		margin = Math.abs(margin);
		const critical = margin >= tn || total < tn/2;

		let damage = null;
		let success_message = 'Success';
		let failure_message = 'Failure';
		let extra_message = `Margin ${margin}`;
		if (success && raw_damage) {
			damage = this._calc_damage(margin, raw_damage);
			success_message = 'Hit';
			failure_message = 'Miss';
			extra_message = `Damage ${damage}`;
		}

		const message = `<div><small>${critical ? 'Critical ' : ''}${success ? success_message : failure_message}! ${extra_message}</small></div>`;
		return {
			success: success,
			critical: critical,
			margin: margin,
			damage: damage,
			message: message
		};
	}

	/**
	 * Show a roll dialog for the test provided in the dataset
	 *
	 * @param dataset
	 * @returns {Promise<void>}
	 * @private
	 */
	async _rollDialog(dataset) {
		const dialog_content = await renderTemplate("systems/saga-machine/templates/roll-dialog.html", {...this.getData(), ...dataset});
		new Dialog({
			title: "Make Test",
			content: dialog_content,
			buttons: {
				roll: {
					label: "Make Test",
					callback: async (html) => {
						let stat = html.find('select[name=stat] > option:selected').data('val');
						let score = html.find('select[name=score] > option:selected').data('val');
						let skill = html.find('select[name=skill] > option:selected').data('val');
						const modifier = html.find('input[name=modifier]').val();
						const boons = html.find('input[name=boons]').val();
						const banes = html.find('input[name=banes]').val();
						const tn = html.find('input[name=tn]').val();
						const damage = html.find('input[name=damage]').val();
						const stat_label = html.find('select[name=stat]').val() || html.find('select[name=score]').val();

						const label = this._test_syntax(stat_label, html.find('select[name=skill]').val(), tn, true);
						const dice = this._dice_roll(boons, banes);
						let roll = await new Roll(dice, this.actor.system);
						let results = await roll.evaluate();
						let pairs = this._make_pairs(results, boons, banes);
						[stat, score, skill] = this.apply_unskilled(stat, score, skill);
						let total = pairs.total + stat || score + skill + modifier;
						if (stat_label === 'defense' || stat_label === 'willpower') this._update_defense(pairs.total);
						const margin = this._calc_margin(this._lookup_tn(tn), total, damage);
						const pairs_message = pairs.pairs ? `<br><strong>Pair of ${pairs.pairs}'s!</strong>` : '';
						let message = await results.toMessage({
							speaker: ChatMessage.getSpeaker({ actor: this.actor }),
							flavor: label
						}, {create: false});
						message.content = `
							<div class="dice-roll">
								<div class="dice-result">
									<div class="dice-formula">
										${results.formula} + <span title="Stat">${stat || score}</span> + <span title="Skill">${skill}</span> + <span title="Modifier">${modifier}</span> 
										${pairs_message}
									</div>
									<div class="dice-tooltip">
										<section class="tooltip-part">
											<div class="dice">
												<header class="part-header flexrow">
													<span class="part-formula">${results.formula}</span>
				
													<span class="part-total">${results.total}</span>
												</header>
												${pairs.html}
											</div>
										</section>
									</div>
									<h4 class="dice-total">${total} ${margin.message}</h4>
								</div>
							</div>`;

						ChatMessage.create(message);

					},
					icon: `<i class="fas fa-check"></i>`
				}
			},
			default: "roll"
		}).render(true, {width: 450});
	}

	/**
	 * If skill is 0 or '0' halve the applicable stat or score
	 *
	 * @param stat
	 * @param score
	 * @param skill
	 */
	apply_unskilled(stat, score, skill) {
		return skill == 0 ?
			[Math.floor(Number(stat) / 2), Math.floor(Number(score) / 2), 0] :
			[Number(stat), Number(score), Number(skill)];
	}

	/**
	 * Upddate the actor's Defense and Willpower TNs after a Defense roll
	 *
	 * @param die
	 * @private
	 */
	_update_defense(die) {
		this.actor.update({'system.scores.defense.tn': this.actor.data.system.scores.defense.value + die});
		this.actor.update({'system.scores.willpower.tn': this.actor.data.system.scores.willpower.value + die});
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
