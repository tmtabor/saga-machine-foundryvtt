export const INITIATIVE = {
    FAST_TURN: "3",
    NPC_TURN: "2",
    SLOW_TURN: "1"
};

Hooks.on('updateActor', async (actor, update) => {
    // Update the combat initiative if the actor has changed its turn type
    const turn_changed = typeof update?.system?.fast_turn !== 'undefined' && update?.system?.fast_turn !== null;
    if (!(turn_changed && (game.user.isGM || actor.isOwner) && game.combat)) return;
    const linked_combatants = game.combat.combatants.filter(c => c.actorId === actor.id);
    linked_combatants.forEach(c => game.combat.setInitiative(c.id, c.getInitiativeValue()));
})

// Patch Core Functions
Combatant.prototype.getInitiativeRoll = function (formula) {
    // If there is no attached actor, this must be an N{C
    if (!this.actor) return new Roll(INITIATIVE.NPC_TURN);

    // If this is marked as an NPC, it must be an NPC
    if (this.isNPC) return this.actor.getInitiativeRoll(INITIATIVE.NPC_TURN);

    // Otherwise, set the turn type as indicated
    else return this.actor.getInitiativeRoll();
};

Combatant.prototype.getInitiativeValue = function () {
    return this.isNPC ? Number(INITIATIVE.NPC_TURN) :
        (this.actor.system.fast_turn ? Number(INITIATIVE.FAST_TURN) : Number(INITIATIVE.SLOW_TURN));
};

Combat.prototype.rollInitiative = async function rollInitiative(ids, {formula=null, updateTurn=true, messageOptions={}}={}) {
    // Iterate over Combatants, performing an initiative roll for each
    const updates = [];
    for ( let [i, id] of (typeof ids === "string" ? [ids] : ids).entries() ) {
      // Get Combatant data
      const combatant = this.combatants.get(id);
      if (!combatant?.isOwner) continue;

      // Produce an initiative roll for the Combatant
      const roll = combatant.getInitiativeRoll(formula);
      await roll.evaluate({async: true});
      updates.push({_id: id, initiative: roll.total});
    }
    if (!updates.length) return this;

    // Update multiple combatants
    await this.updateEmbeddedDocuments("Combatant", updates);

    // Ensure the turn order remains with the same combatant
    if ( updateTurn && this.combatant?.id ) await this.update({turn: this.turns.findIndex(t => t.id === this.combatant?.id)});

    return this;
}

export class SMCombatTracker extends CombatTracker {
    constructor(options) {
        super(options)
    }

    activateListeners(html) {
        const combatants = this.viewed?.combatants;

        // For each combatant in the tracker, change the initiative selector
        html.find('.combatant').each((i, el) => {
            const combatant_id = el.getAttribute('data-combatant-id');
            const combatant = combatants.get(combatant_id);
            if (!combatant) return;

            const initiative = combatant.isNPC ? 'NPC' :
                (combatant.actor?.system?.fast_turn ? 'FAST' : 'SLOW');

            el.getElementsByClassName('token-initiative')[0].innerHTML =
                `<a class="combatant-control dlturnorder" title="Change Turn">${initiative}</a>`;
        });

        super.activateListeners(html);

        // When the turn type is clicked in the tracker, toggle the type, unless NPC
        html.find('.dlturnorder').click(async ev => {
            const li = ev.currentTarget.closest('li');
            const combatant_id = li.dataset.combatantId;
            const combatant = combatants.get(combatant_id);
            if (!combatant || combatant.isNPC) return;

            if (game.user.isGM || combatant.actor.isOwner) {
                await combatant.actor.update({'system.fast_turn': !combatant.actor.system.fast_turn});
                if (this.viewed) this.viewed.setupTurns();
            }
        });
    }
}