import { random_member } from "../system/utils.js";

/**
 * A simple data class representing narrative aspects of a wound ahead of being transformed into a consequence.
 *
 * @see WoundFactory - A class for generating Wound objects randomly and from the Grave Wounds table
 */
class Wound {
    /**
     * A brief description of the wound. This gets turned into the specialization field of the resulting consequence.
     *
     * @type {string}
     */
    descriptor;

    /**
     * A longer description of the wound and its effects. This turns into the description field of the resulting
     * consequence. This is primarily used to describe the game mechanics of Grave Wounds.
     *
     * @type {string}
     */
    description;

    /**
     * Creates a new wound and optionally sets descriptor and description
     *
     * @param {string} [descriptor='']
     * @param {string} [description='']
     */
    constructor(descriptor, description) {
        this.descriptor = descriptor || '';
        this.description = description || '';
    }
}

/**
 * Generates Wound objects which get passed to actors and transformed into the appropriate consequences
 *
 * @see Wound - A simple data class representing the wound
 */
export class WoundFactory {
    /**
     * Generates a Wound object to be given to an actor
     *
     * @param {string} type - The damage type of the wound in abbreviated format (e.g. cut, pi, sm)
     * @param {boolean} critical - Whether the wound is being dealt by a critical hit
     * @returns {Promise<Wound>}
     */
    static async generate_wound(type, critical) {
        const wound = new Wound();

        // Handle grave wounds
        if (critical) {
            const grave_wounds_table = game.tables.getName('Grave Wounds');
            if (grave_wounds_table) {
                wound.description = (await grave_wounds_table.draw()).results[0].text;
                wound.descriptor = wound.description.split(':')[0];
                return wound;
            }
            else {
                wound.descriptor = random_member(['grave ', 'deep ', 'severe ',
                    'critical ', 'serious ', 'major ']);
            }
        }

        if (type !== 'fat') wound.descriptor += random_member(['arm ', 'leg ', 'abdomen ', 'chest ', 'head ',
            'neck ', 'hand ', 'foot ', 'knee ', 'elbow ', 'forearm ', 'shin ', 'side ', 'back ', 'cheek ', 'brow ',
            'shoulder ', 'hip ', 'thigh ', 'groin ', 'rib ', 'skull ', 'face ']);

        switch (type) {
            case 'burn':
            case 'cor':
            case 'fr':
            case 'tox':
                wound.descriptor += random_member(['burn', 'sore', 'lesion']);
                break;
            case 'cut':
                wound.descriptor += random_member(['slash', 'cut', 'slice']);
                break;
            case 'fat':
                wound.descriptor += random_member(['tired', 'weakened', 'winded']);
                break;
            case 'pi':
                wound.descriptor += random_member(['stab', 'puncture', 'gash']);
                break;
            case 'sm':
                wound.descriptor += random_member(['bruise', 'trauma', 'rent']);
                break;
            default:
                wound.descriptor += random_member(['wound', 'gash', 'laceration']);
        }

        return wound;
    }
}