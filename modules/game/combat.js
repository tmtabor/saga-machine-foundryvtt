import { SagaMachineActor } from "../actor/actor.js";
import { Effect } from "./damage.js";

/**
 * Initiative constants for FAST / NPC / SLOW turns
 * @type {{FAST_TURN: string, SLOW_TURN: string, NPC_TURN: string}}
 */
export const INITIATIVE = {
    FAST_TURN: "3",
    NPC_TURN: "2",
    SLOW_TURN: "1"
};

/**
 * Combatant includes patched functionality to support Saga Machine's fast/slow turns
 *
 * @inheritDoc
 */
export class SagaMachineCombatant extends Combatant {
    /**
     * @inheritDoc
     * @override
     * @param formula
     * @return {*|Roll}
     */
    getInitiativeRoll(formula) {
        // If there is no attached actor, this must be an NPC
        if (!this.actor) return new Roll(INITIATIVE.NPC_TURN);

        // If this is marked as an NPC, it must be an NPC
        if (this.isNPC) return this.actor.getInitiativeRoll(INITIATIVE.NPC_TURN);

        // Otherwise, set the turn type as indicated
        else return this.actor.getInitiativeRoll();
    }

    /**
     * Returns the value of the combatant's initiative - a constant representing  a fast / NPC / slow turn
     *
     * @return {number}
     */
    getInitiativeValue() {
        return this.isNPC ? Number(INITIATIVE.NPC_TURN) :
            (this.actor.system.fast_turn ? Number(INITIATIVE.FAST_TURN) : Number(INITIATIVE.SLOW_TURN));
    }
}

/**
 * Combat includes override that sets initiative based on fast / npc / slow turns
 *
 * @inheritDoc
 */
export class SagaMachineCombat extends Combat {
    /**
     * @inheritDoc
     * @override
     * @param ids
     * @param formula
     * @param updateTurn
     * @param messageOptions
     * @return {Promise<SagaMachineCombat>}
     */
    async rollInitiative(ids, {formula=null, updateTurn=true, messageOptions={}}={}) {
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

    /**
     * Update the initiative of all combatants with the matching actor
     *
     * @param {SagaMachineActor} actor
     * @param {string|null|undefined} turn_type
     * @return {Promise<void>}
     */
    async update_combatant_initiative(actor, turn_type) {
        if (typeof turn_type === 'undefined' || turn_type === null) return;
        const linked_combatants = game.combat.combatants.filter(c => c.actorId === actor.id);
        for (const c of linked_combatants)
            await game.combat.setInitiative(c.id, c.getInitiativeValue())
    }

    /**
     * Highlight Defense rolls for the GM in case this is a chase, picking out obstacles and a leg up
     *
     * @param {SagaMachineActor} actor
     * @param {boolean} willpower
     * @return {string}
     */
    chase_label(actor, willpower=false) {
        const score = willpower ? actor?.system?.scores?.willpower : actor?.system?.scores?.defense;
        if (!score) return `<span class="defense-tn">&mdash;</span>`;

        const roll = actor.system.scores.defense.roll;
        let highlight = '';
        let title = '';
        switch (roll) {
            case 1:
                highlight = 'critical failure';
                title = 'If this is a chase, the character encounters an obstacle.';
                break;
            case 9:
            case 10:
                highlight = 'critical success';
                title = 'If this is a chase, the character gains a leg up.';
                break;
        }

        return `<span class="defense-tn ${highlight}" title="${title}">${score.tn}</span>`;
    }

    /**
     * Perform all start of combat and start of round tasks
     *
     * @return {Promise<void>}
     */
    async start_of_round(){
        /** Perform new round actions */
        const new_round = async (html) => {
            // Ensure that all combatants have a fast / slow turn marked in the order
            await this.rollAll();

            // Cycle through all combatants
            for (let c of this.combatants) {

                // Make a defense test for everyone
                if (c.actor.type === "character")
                    await c.actor.test({
                        stat: 'defense', effects: [{"type": "defense"}], whisper: true, chat: true,
                        ...c.actor.total_modifiers({score: 'defense'})
                    });
            }

            // New Round Card - prompt players to choose fast / slow turn and display statuses
            let content = `<h3>Round ${this.round}</h3><p><strong>Choose a Fast or Slow turn now!</strong></p><table>`;
            for (let c of this.combatants) {
                if (c.hidden) continue; // Don't show hidden combatants
                const statuses = Array.from(c.actor.statuses.map(s => s.split(/\s|-/).map(w => w.capitalize()).join(' '))).sort().join(', ');
                content += `<tr><td><strong>${c.name}</strong></td><td>${statuses ? statuses : '&mdash;'}</td></tr>`;
            }
            content += '</table>';
            await ChatMessage.create({content: content});

            // Whisper all defenses to GM
            content = '<h4><strong>Defenses This Round</strong></h4><table>';
            for (let c of this.combatants)
                content += `<tr><td><strong>${c.name}</strong></td><td>Defense ${this.chase_label(c.actor)}</td><td>Willpower ${this.chase_label(c.actor, true)}</td></tr>`;
            content += '</table>';
            await ChatMessage.create({
                content: content,
                whisper: game.users.filter(u => u.isGM).map(u => u.id)
            });

            // Chat messages for Bleeding and Dying consequences
            for (let c of this.combatants) {

                // Test Endurance when dying, prompt to add or remove Dying conditions
                if (c.actor.statuses.has('dying') && !c.actor.statuses.has('defeated')) {
                    await ChatMessage.create({
                        speaker: ChatMessage.getSpeaker({actor: c.actor}), content:
                            `<p><strong>${c.name} is Dying!</strong></p><ul><li>Limited to 1 AP.</li><li>Making an Endurance test.` +
                            `<ul><li><em>Crit Success:</em> Lose a Dying.</li><li><em>Failure:</em> Gain a Dying.</li><li><em>3 Dying:</em> ${c.name} dies.</li></ul></li></ul>`
                    });
                    await c.actor.test({
                        stat: 'endurance', tn: c.actor.dying_tn(), chat: true,
                        effects: [{"type": "consequence", "name": "Dying", "when": "failure", "target": "self"}],
                        ...c.actor.total_modifiers({score: 'defense'})
                    });
                }

                // Note Bleeding and prompt for damage
                if (c.actor.statuses.has('bleeding') && !c.actor.statuses.has('defeated')) {
                    c.actor.items.filter(c => c.type === "consequence" && c.name === "Bleeding").forEach(b => {
                        if (b.system.rank > 0) {
                            const damage = new Effect({
                                "type": "damage",
                                "value": b.system.rank,
                                "damage_type": b.system.specialization,
                                "properties": "Ignores",
                                "when": "always",
                                "target": "self"
                            }).apply();
                            ChatMessage.create({
                                speaker: ChatMessage.getSpeaker({actor: c.actor}),
                                content: `<p><strong>${c.name} is Bleeding!</strong></p><ul><li>Right-click and select Apply Damage.</li><li>${damage.message}</li></ul>`
                            });
                        }
                    });
                }
            }
        };

        new Dialog({
            title: `Begin New Round?`,
            content: `<p>Do you want to begin a new round? Make sure to prompt your players to set their defenses first, if necessary.</p>`,
            buttons: {
                Yes: {
                    icon: "<i class='fas fa-check'></i>",
                    label: 'Yes',
                    callback: new_round
                },
                No: {
                    icon: "<i class='fas fa-times'></i>",
                    label: 'No',
                    callback: () => {}
                }
            },
            default: 'Yes'
        }).render(true);
    }
}

/**
 * Modified combat tracker that includes a fast/slow turn toggle
 *
 * @inheritDoc
 */
export class SagaMachineCombatTracker extends CombatTracker {
    /**
     * @inheritDoc
     * @param html
     */
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