import { Consequence } from "./tests.js";

export const INITIATIVE = {
    FAST_TURN: "3",
    NPC_TURN: "2",
    SLOW_TURN: "1"
};

Hooks.on("preUpdateCombat", async (combat, update_data) => {
    if (!update_data.round && !update_data.turn) return;

    const start_of_round = async () => {
        // Ensure that all combatants have a fast / slow turn marked in the order
        await combat.rollAll();

        // Cycle through all combatants
        for (let c of combat.combatants) {

            // Make a defense test for everyone
            await c.actor.test({
                stat: 'defense', consequences: [{"type": "defense"}], whisper: true, chat: true,
                ...c.actor.total_modifiers({score: 'defense'})
            });
        }

        // New Round Card - prompt players to choose fast / slow turn and display statuses
        let content = `<h3>Round ${combat.round+1}</h3><p><strong>Choose a Fast or Slow turn now!</strong></p><table>`;
        for (let c of combat.combatants) {
            if (c.hidden) continue; // Don't show hidden combatants
            const statuses = Array.from(c.actor.statuses.map(s => s.split(/\s|-/).map(w => w.capitalize()).join(' '))).sort().join(', ');
            content += `<tr><td><strong>${c.name}</strong></td><td>${statuses ? statuses : '&mdash;'}</td></tr>`;
        }
        content += '</table>';
        ChatMessage.create({content: content});

        // Wait for the new defenses to take effect
        setTimeout(async () => {

            // Whisper all defenses to GM
            content = '<h4><strong>Defenses This Round</strong></h4><table>';
            for (let c of combat.combatants)
                content += `<tr><td><strong>${c.name}</strong></td><td>Defense ${c.actor.system.scores.defense.tn}</td><td>Willpower ${c.actor.system.scores.willpower.tn}</td></tr>`;
            content += '</table>';
            ChatMessage.create({
                content: content,
                type: CONST.CHAT_MESSAGE_TYPES.WHISPER,
                whisper: game.users.filter(u => u.isGM).map(u => u.id)
            });

            // Chat messages for Bleeding and Dying consequences
            for (let c of combat.combatants) {

                // Test Endurance when dying, prompt to add or remove Dying conditions
                if (c.actor.statuses.has('dying') && !c.actor.statuses.has('defeated')) {
                    ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: c.actor }), content:
                            `<p><strong>${c.name} is Dying!</strong></p><ul><li>Limited to 1 AP.</li><li>Making an Endurance test.` +
                            `<ul><li><em>Crit Success:</em> Gain a Dying.</li><li><em>Failure:</em> Lose a Dying.</li><li><em>3 Dying:</em> ${c.name} dies.</li></ul></li></ul>` });
                    await c.actor.test({
                        stat: 'endurance', tn: c.actor.dying_tn(), chat: true,
                        consequences: [{"type": "consequence", "name": "Dying", "when": "failure", "target": "self"}],
                        ...c.actor.total_modifiers({score: 'defense'})
                    });
                }

                // Note Bleeding and prompt for damage
                if (c.actor.statuses.has('bleeding') && !c.actor.statuses.has('defeated')) {
                    c.actor.items.filter(c => c.type === "consequence" && c.name === "Bleeding").forEach(b => {
                        if (b.system.rank > 0) {
                            const damage = new Consequence({
                                "type": "damage",
                                "value": b.system.rank,
                                "damage_type": b.system.specialization,
                                "when": "always",
                                "target": "self" }).apply();
                            ChatMessage.create({
                                speaker: ChatMessage.getSpeaker({ actor: c.actor }),
                                content: `<p><strong>${c.name} is Bleeding!</strong></p><ul><li class="ignores">Right-click and select Apply Damage.</li><li>${damage.message}</li></ul>`
                            });
                        }
                    });
                }
            }

        }, 1000);
    };

    // Start of Combat
    if (combat.round === 0  && combat.active) await start_of_round();

    // Start of Each New Round
    if (combat.round !== 0 && combat.turns && combat.active && combat.current.turn > -1 &&
        combat.current.turn === combat.turns.length - 1) await start_of_round();
});

Hooks.on('updateActor', async (actor, update) => {
    // Update the combat initiative if the actor has changed its turn type
    const turn_changed = typeof update?.system?.fast_turn !== 'undefined' && update?.system?.fast_turn !== null;
    if (!(turn_changed && (game.user.isGM || actor.isOwner) && game.combat)) return;
    const linked_combatants = game.combat.combatants.filter(c => c.actorId === actor.id);
    linked_combatants.forEach(c => game.combat.setInitiative(c.id, c.getInitiativeValue()));
});

// Patch Core Functions
Combatant.prototype.getInitiativeRoll = function (formula) {
    // If there is no attached actor, this must be an NPC
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