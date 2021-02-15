const Discord = require('discord.js');
const stringSimilarity = require("string-similarity");
const Log = require('./Log');
const util = require('./util');

class RepeatedMessage {

    /**
     * Repeated messages
     * key: {guildid}-{userid}
     * @type {module:"discord.js".Collection<module:"discord.js".Snowflake, RepeatedMessage>}
     */
    static #members = new Discord.Collection();

    /**
     * the key of this RepeatedMessage
     * {message.guild.id}-{message.author.id}
     * @type {String}
     */
    #key;

    /**
     * messages that haven't been deleted
     * @type {module:"discord.js".Message[]}
     */
    #messages = [];

    /**
     * @param {module:"discord.js".Message} message
     */
    constructor(message) {
        this.#key = this.constructor.getKey(message);
        this.#messages.push(message);
    }

    /**
     * Are these messages similar enough?
     * @param {module:"discord.js".Message} messageA
     * @param {module:"discord.js".Message} messageB
     * @return {boolean}
     */
    similarEnough(messageA, messageB) {
        const similarity = stringSimilarity.compareTwoStrings(messageA.content, messageB.content);
        return similarity > 0.85;
    }

    /**
     * get count of similar messages
     * @return {number}
     */
    getSimilarMessageCount(newMessage) {
        return this.getSimilarMessages(newMessage).length;
    }

    /**
     * get similar messages
     * @param {module:"discord.js".Message} newMessage
     * @return {module:"discord.js".Message[]}
     */
    getSimilarMessages(newMessage) {
        let similarMessages = [];
        for (const cachedMessage of this.#messages) {
            if (this.similarEnough(newMessage, cachedMessage)) {
                similarMessages.push(cachedMessage);
            }
        }
        return similarMessages;
    }

    /**
     *  how many messages are cached for this member?
     *  @return {Number}
     */
    getMessageCount() {
        return this.#messages.length;
    }

    /**
     * add a message
     * @param {module:"discord.js".Message} message
     */
    add(message) {
        this.#messages.push(message);
        setTimeout(() => {
            this.#messages.shift();
            if (this.#messages.length === 0) {
                this.constructor.#members.delete(this.#key);
            }
        }, 30000);
    }

    /**
     * @return {Promise<void>}
     */
    async deleteAll() {
        const reason = `Fast message spam`;
        for (const message of this.#messages) {
            if (message.deletable) {
                await util.delete(message, {reason});
                await Log.logMessageDeletion(message, reason)
            }
        }
    }

    /**
     * delete similar messages
     * @param {module:"discord.js".Message} message
     * @return {Promise<void>}
     */
    async deleteSimilar(message) {
        const reason = `Repeated messages`;
        for (const cacheMessage of this.getSimilarMessages(message)) {
            if (cacheMessage.deletable) {
                await util.delete(cacheMessage, {reason});
                await Log.logMessageDeletion(cacheMessage, reason)
            }
        }
    }

    /**
     * get the key of this message
     * @param {module:"discord.js".Message} message
     * @return {string}
     */
    static getKey(message) {
        return `${message.guild.id}-${message.author.id}`;
    }

    /**
     * @param key
     * @return {RepeatedMessage}
     */
    static get(key) {
        return this.#members.get(key);
    }

    /**
     * remove this message if it is spam
     * @param {module:"discord.js".Message} message
     */
    static async checkSpam(message) {
        const key = this.getKey(message);
        if (!this.#members.has(key)) {
            this.#members.set(key, new RepeatedMessage(message));
            return;
        }

        /** @type {RepeatedMessage} */
        const cache = this.#members.get(key);
        cache.add(message);
        const similar = cache.getSimilarMessageCount(message);

        if (cache.getMessageCount() >= 5) {
            await cache.deleteAll();
            /** @type {module:"discord.js".Message} */
            const reply = await message.channel.send(`<@!${message.author.id}> stop sending messages this fast!`);
            await reply.delete({timeout: 3000});
        }
        else if (similar >= 2) {
            await cache.deleteSimilar(message);
            /** @type {module:"discord.js".Message} */
            const reply = await message.channel.send(`<@!${message.author.id}> stop repeating your messages!`);
            await reply.delete({timeout: 3000});
        }
    }
}

module.exports = RepeatedMessage;
