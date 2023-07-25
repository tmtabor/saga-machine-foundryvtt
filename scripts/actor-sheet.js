import { EntitySheetHelper } from "./helper.js";

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
			height: 600,
			tabs: [{navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "basics"}],
			// scrollY: [".biography", ".items", ".attributes"],
			// dragDrop: [{dragSelector: ".item-list .item", dropSelector: null}]
		});
	}

	/* -------------------------------------------- */

	/** @inheritdoc */
	getData() {
		const context = super.getData();
		//   // EntitySheetHelper.getAttributeData(context.data);
		//   // context.shorthand = true;
		//   context.system = context.data.data;
		//   // console.log(context);
		//   // context.dtypes = ["String", "Number", "Boolean", "Formula", "Resource"];

		context.data.system.skills = context.data.items.filter( item => item.type === 'skill').sort((a, b) =>  {
			if ( a.name > b.name ) return 1;
			return -1;
		});

		context.data.system.traits = context.data.items.filter( item => item.type === 'trait').sort((a, b) =>  {
			if ( a.name > b.name ) return 1;
			return -1;
		});

		context.data.system.weaknesses = context.data.items.filter( item => item.type === 'weakness').sort((a, b) =>  {
			if ( a.name > b.name ) return 1;
			return -1;
		});

		context.data.system.origins = context.data.items.filter( item => item.type === 'origin').sort((a, b) =>  {
			if ( a.name > b.name ) return 1;
			return -1;
		});

		context.data.system.paths = context.data.items.filter( item => item.type === 'path').sort((a, b) =>  {
			if ( a.name > b.name ) return 1;
			return -1;
		});

		context.data.system.consequences = context.data.items.filter( item => item.type === 'consequence').sort((a, b) =>  {
			if ( a.name > b.name ) return 1;
			return -1;
		});

		context.data.system.equipment = context.data.items.filter( item => item.type === 'item').sort((a, b) =>  {
			if ( a.name > b.name ) return 1;
			return -1;
		});

		context.data.system.ambitions = context.data.items.filter( item => item.type === 'ambition').sort((a, b) =>  {
			if ( a.system.type > b.system.type ) return 1;
			return -1;
		});

		return context;
	}

	/* -------------------------------------------- */

	// /** @inheritdoc */
	activateListeners(html) {
		super.activateListeners(html);
		//
		// Everything below here is only needed if the sheet is editable
		if ( !this.isEditable ) return;
		//
		//   // Attribute Management
		//   html.find(".attributes").on("click", ".attribute-control", EntitySheetHelper.onClickAttributeControl.bind(this));
		//   html.find(".groups").on("click", ".group-control", EntitySheetHelper.onClickAttributeGroupControl.bind(this));
		//   html.find(".attributes").on("click", "a.attribute-roll", EntitySheetHelper.onAttributeRoll.bind(this));
		//
		// Item Controls
		html.find('.item-create').click(this._onItemCreate.bind(this));

		html.find('.item-edit').click(ev => {
			const box = $(ev.currentTarget).parents(".item");
			const item = this.actor.items.get(box.data("id"));
			item.sheet.render(true);
		});

		html.find('.item-delete').click(ev => {
			const box = $(ev.currentTarget).parents(".item");
			const item = this.actor.items.get(box.data("id"));
			item.delete();
			box.slideUp(200, () => this.render(false));
		});

		html.find('.item-input').on("change", ev => {
			const box = $(ev.currentTarget).parents(".item");
			const item = this.actor.items.get(box.data("id"));

			const update = { _id: box.data("id"), 'system.rank': Number(ev.currentTarget.value) };
			this.actor.updateEmbeddedDocuments("Item", [update] );
		});


		html.find('.rollable').click(this._onRoll.bind(this));


		//   html.find(".item-control").click(this._onItemControl.bind(this));
		//   html.find(".items .rollable").on("click", this._onItemRoll.bind(this));
		//
		//   // Add draggable for Macro creation
		//   html.find(".attributes a.attribute-roll").each((i, a) => {
		//     a.setAttribute("draggable", true);
		//     a.addEventListener("dragstart", ev => {
		//       let dragData = ev.currentTarget.dataset;
		//       ev.dataTransfer.setData('text/plain', JSON.stringify(dragData));
		//     }, false);
		//   });
	}

	async _onRoll(event) {
		event.preventDefault();
		this._rollDialog(event.currentTarget.dataset);
	}

	_capitalize(word) {
		return word.charAt(0).toUpperCase() + word.slice(1);
	}

	_test_syntax(stat, skill, tn, append_test=true) {
		const stat_label = stat ? this._capitalize(stat) : '1d10';
		const skill_label = skill ? `/${skill}` : '';
		const tn_label = tn ? `-${tn}` : '';
		return stat_label + skill_label + tn_label + (append_test ? ' Test' : '');
	}

	_dice_roll(boons, banes) {
		// Correct for blank and undefined values
		if (!boons) boons = 0;
		if (!banes) banes = 0;

		const total = boons - banes;
		if (total === 0) return '1d10';
		else if (total > 0) return `${total+1}d10kh1`;
		else return `${total*-1+1}d10kl1`;
	}

	_dice_html(results) {
		let to_return = '<ol class="dice-rolls">';
		for (let i of results) {
			const discarded = i.discarded ? 'discarded' : '';
			to_return += `<li class="roll die d10 ${discarded}">${i.result}</li>`;
		}

		to_return += '</ol>';
		return to_return;
	}

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

	_calc_margin(tn, total) {
		// Handle unknown TN
		if (!tn) return {
			message: ''
		};

		let margin = total - tn;
		const success = margin >= 0;
		margin = Math.abs(margin);
		const critical = margin >= tn || total < tn/2;
		const message = `<div><small>${critical ? 'Critical ' : ''}${success ? 'Success' : 'Failure'}! Margin ${margin}</small></div>`;
		return {
			success: success,
			critical: critical,
			margin: margin,
			message: message
		};
	}

	async _rollDialog(dataset) {
		const dialog_content = await renderTemplate("systems/saga-machine/templates/roll_dialog.html", {...this.getData(), ...dataset});
		new Dialog({
			title: "Make Test",
			content: dialog_content,
			buttons: {
				roll: {
					label: "Make Test",
					callback: async (html) => {
						const stat = html.find('select[name=stat] > option:selected').data('val');
						const score = html.find('select[name=score] > option:selected').data('val');
						const skill = html.find('select[name=skill] > option:selected').data('val');
						const modifier = html.find('input[name=modifier]').val();
						const boons = html.find('input[name=boons]').val();
						const banes = html.find('input[name=banes]').val();
						const tn = html.find('input[name=tn]').val();
						const stat_label = html.find('select[name=stat]').val() || html.find('select[name=score]').val();

						const label = this._test_syntax(stat_label, html.find('select[name=skill]').val(), tn, true);
						const dice = this._dice_roll(boons, banes);
						let roll = await new Roll(dice, this.actor.system);
						let results = await roll.evaluate();
						let pairs = this._make_pairs(results, boons, banes);
						let total = pairs.total + Number(stat || score) + Number(skill) + Number(modifier);
						if (stat_label === 'defense' || stat_label === 'willpower') this._update_defense(pairs.total)
						const margin = this._calc_margin(Number(tn), total);
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
		}).render(true);
	}

	_update_defense(die) {
		this.actor.update({'system.scores.defense.tn': this.actor.data.system.scores.defense.value + die});
		this.actor.update({'system.scores.willpower.tn': this.actor.data.system.scores.willpower.value + die});
	}

	async _onItemCreate(event) {
		const type = $(event.currentTarget).data("type");

		event.preventDefault();
		const header = event.currentTarget;
		// Grab any data associated with this control.
		const data = duplicate(header.dataset);
		// Initialize a default name.
		const name = `New ${type}`;
		// Prepare the item object.
		const itemData = {
			name: name,
			type: type,
			system: data
		};
		// Remove the type from the dataset since it's in the itemData.type prop.
		// delete itemData.system["type"];

		// Finally, create the item!
		return await Item.create(itemData, {parent: this.actor});
	}


	// /* -------------------------------------------- */
	//
	// /**
	//  * Handle click events for Item control buttons within the Actor Sheet
	//  * @param event
	//  * @private
	//  */
	// _onItemControl(event) {
	//   event.preventDefault();
	//
	//   // Obtain event data
	//   const button = event.currentTarget;
	//   const li = button.closest(".item");
	//   const item = this.actor.items.get(li?.dataset.itemId);
	//
	//   // Handle different actions
	//   switch ( button.dataset.action ) {
	//     case "create":
	//       const cls = getDocumentClass("Item");
	//       return cls.create({name: game.i18n.localize("SIMPLE.ItemNew"), type: "item"}, {parent: this.actor});
	//     case "edit":
	//       return item.sheet.render(true);
	//     case "delete":
	//       return item.delete();
	//   }
	// }
	//
	// /* -------------------------------------------- */
	//
	// /**
	//  * Listen for roll buttons on items.
	//  * @param {MouseEvent} event    The originating left click event
	//  */
	// _onItemRoll(event) {
	//   let button = $(event.currentTarget);
	//   const li = button.parents(".item");
	//   const item = this.actor.items.get(li.data("itemId"));
	//   let r = new Roll(button.data('roll'), this.actor.getRollData());
	//   return r.toMessage({
	//     user: game.user.id,
	//     speaker: ChatMessage.getSpeaker({ actor: this.actor }),
	//     flavor: `<h2>${item.name}</h2><h3>${button.text()}</h3>`
	//   });
	// }
	//
	// /* -------------------------------------------- */
	//
	// /** @inheritdoc */
	// _getSubmitData(updateData) {
	//   let formData = super._getSubmitData(updateData);
	//   formData = EntitySheetHelper.updateAttributes(formData, this.object);
	//   formData = EntitySheetHelper.updateGroups(formData, this.object);
	//   return formData;
	// }
}
