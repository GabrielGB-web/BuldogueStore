const { Client, GatewayIntentBits, Collection, ActivityType } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

client.commands = new Collection();

// Carregar comandos
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  client.commands.set(command.data.name, command);
}

// Carregar eventos
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
  const filePath = path.join(eventsPath, file);
  const event = require(filePath);
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args));
  } else {
    client.on(event.name, (...args) => event.execute(...args));
  }
}

// Variáveis globais
client.tickets = new Map();

// Evento quando o bot fica online
client.once('ready', async () => {
  console.log(`✅ Bot conectado como ${client.user.tag}`);
  console.log(`📊 Servidores: ${client.guilds.cache.size}`);
  
  client.user.setActivity('Tickets | /setup-ticket', { type: ActivityType.Watching });

  // Registrar comandos slash
  try {
    const { REST, Routes } = require('discord.js');
    
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    
    const commands = Array.from(client.commands.values()).map(cmd => cmd.data.toJSON());
    
    console.log('📡 Registrando comandos slash...');
    
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID),
      { body: commands }
    );
    
    console.log('✅ Comandos slash registrados com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao registrar comandos:', error);
  }
});

// Login do bot
client.login(process.env.DISCORD_TOKEN);
