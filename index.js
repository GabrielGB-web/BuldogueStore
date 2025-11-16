const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ChannelType, 
    PermissionsBitField 
} = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// Configurações do bot
const config = {
    ticketCategoria: '🎫 TICKETS',
    staffRole: 'Staff',
    logChannel: 'logs-tickets'
};

// Sistema de tickets ativos
const activeTickets = new Map();

// Quando o bot ficar online
client.once('ready', () => {
    console.log(`🎉 Bot conectado como: ${client.user.tag}`);
    console.log(`⏰ Iniciado em: ${new Date().toLocaleString('pt-BR')}`);
    console.log(`🔗 Hospedado no Railway - Bot online e funcionando!`);
    
    // Definir status do bot
    client.user.setActivity('🎫 Tickets da Loja | !ajuda', { type: 'WATCHING' });
});

// Comando para criar painel de tickets
client.on('messageCreate', async (message) => {
    // Comando de setup (apenas administradores)
    if (message.content === '!setup-tickets' && message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        const embed = new EmbedBuilder()
            .setTitle('🎫 SISTEMA DE SUPORTE - NOSSA LOJA')
            .setDescription('**Selecione abaixo o tipo de atendimento desejado:**\n\n• 🛒 **Compras**: Dúvidas sobre produtos, pedidos e compras\n• ❓ **Dúvidas**: Tire suas dúvidas gerais sobre nossa loja\n• 🤝 **Parcerias**: Propostas de parceria e colaboração')
            .setColor(0x0099FF)
            .setThumbnail(client.user.displayAvatarURL())
            .setFooter({ 
                text: '💎 Nossa Loja - Atendimento Rápido e Qualificado', 
                iconURL: message.guild.iconURL() 
            })
            .setTimestamp();

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('compras_ticket')
                    .setLabel('🛒 Compras')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🛒'),
                new ButtonBuilder()
                    .setCustomId('duvidas_ticket')
                    .setLabel('❓ Dúvidas')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('❓'),
                new ButtonBuilder()
                    .setCustomId('parcerias_ticket')
                    .setLabel('🤝 Parcerias')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('🤝')
            );

        await message.channel.send({ 
            embeds: [embed], 
            components: [row] 
        });
        
        await message.delete();
        return;
    }

    // Comando de ajuda
    if (message.content === '!ajuda' || message.content === '!help') {
        const helpEmbed = new EmbedBuilder()
            .setTitle('🆘 AJUDA - SISTEMA DE TICKETS')
            .setDescription('**Como usar nosso sistema de tickets:**\n\n1. **Clique em um dos botões** no painel de tickets\n2. **Um canal privado será criado** apenas para você e nossa equipe\n3. **Descreva seu problema** ou dúvida detalhadamente\n4. **Nossa equipe responderá** em breve!')
            .setColor(0xFFA500)
            .addFields(
                { name: '🛒 Compras', value: 'Problemas com pedidos, produtos, pagamentos', inline: true },
                { name: '❓ Dúvidas', value: 'Perguntas gerais sobre a loja', inline: true },
                { name: '🤝 Parcerias', value: 'Propostas comerciais', inline: true }
            )
            .setFooter({ text: 'Equipe de Suporte - Nossa Loja' });

        await message.channel.send({ embeds: [helpEmbed] });
    }
});

// Sistema de criação de tickets
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    const { user, guild, customId } = interaction;

    // Verificar se é um botão de ticket
    if (!['compras_ticket', 'duvidas_ticket', 'parcerias_ticket', 'close_ticket'].includes(customId)) return;

    // FECHAR TICKET
    if (customId === 'close_ticket') {
        await handleCloseTicket(interaction);
        return;
    }

    // CRIAR NOVO TICKET
    await handleCreateTicket(interaction, customId);
});

// Função para criar tickets
async function handleCreateTicket(interaction, ticketType) {
    const { user, guild } = interaction;

    // Verificar se usuário já tem ticket aberto
    if (activeTickets.has(user.id)) {
        const existingChannel = guild.channels.cache.get(activeTickets.get(user.id));
        return await interaction.reply({ 
            content: `❌ Você já tem um ticket aberto! ${existingChannel ? existingChannel.toString() : ''}`,
            ephemeral: true 
        });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
        // Configurações do tipo de ticket
        let typeConfig = {
            'compras_ticket': { name: '🛒 Compras', color: 0x3498db, emoji: '🛒' },
            'duvidas_ticket': { name: '❓ Dúvidas', color: 0xf1c40f, emoji: '❓' },
            'parcerias_ticket': { name: '🤝 Parcerias', color: 0x2ecc71, emoji: '🤝' }
        }[ticketType];

        // Encontrar ou criar categoria
        let category = guild.channels.cache.find(
            c => c.name === config.ticketCategoria && c.type === ChannelType.GuildCategory
        );

        if (!category) {
            category = await guild.channels.create({
                name: config.ticketCategoria,
                type: ChannelType.GuildCategory,
                permissionOverwrites: [
                    {
                        id: guild.roles.everyone.id,
                        deny: [PermissionsBitField.Flags.ViewChannel]
                    },
                    {
                        id: guild.roles.cache.find(r => r.name === config.staffRole)?.id || guild.ownerId,
                        allow: [PermissionsBitField.Flags.ViewChannel]
                    }
                ]
            });
        }

        // Criar canal do ticket
        const ticketNumber = Math.floor(Math.random() * 1000) + 1;
        const ticketChannel = await guild.channels.create({
            name: `ticket-${typeConfig.emoji}-${user.username}-${ticketNumber}`.toLowerCase(),
            type: ChannelType.GuildText,
            parent: category.id,
            topic: `Ticket de ${typeConfig.name} - ${user.tag} | ${new Date().toLocaleDateString('pt-BR')}`,
            permissionOverwrites: [
                {
                    id: guild.roles.everyone.id,
                    deny: [PermissionsBitField.Flags.ViewChannel]
                },
                {
                    id: user.id,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.SendMessages,
                        PermissionsBitField.Flags.ReadMessageHistory,
                        PermissionsBitField.Flags.AttachFiles
                    ]
                },
                {
                    id: guild.roles.cache.find(r => r.name === config.staffRole)?.id || guild.ownerId,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.SendMessages,
                        PermissionsBitField.Flags.ReadMessageHistory,
                        PermissionsBitField.Flags.AttachFiles,
                        PermissionsBitField.Flags.ManageMessages
                    ]
                }
            ]
        });

        // Salvar ticket ativo
        activeTickets.set(user.id, ticketChannel.id);

        // Embed de boas-vindas no ticket
        const ticketEmbed = new EmbedBuilder()
            .setTitle(`${typeConfig.emoji} TICKET - ${typeConfig.name.toUpperCase()}`)
            .setDescription(`**Olá ${user.username}!**\n\nNossa equipe de suporte foi notificada e responderá em breve.\n\n📝 **Por favor, descreva detalhadamente:**\n• Sua dúvida/problema\n• Pedido (se aplicável)\n• Qualquer informação relevante`)
            .addFields(
                { name: '👤 Cliente', value: `${user} (\`${user.tag}\`)`, inline: true },
                { name: '📅 Data', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                { name: '🔢 Ticket ID', value: `#${ticketNumber}`, inline: true },
                { name: '💼 Responsável', value: `<@&${guild.roles.cache.find(r => r.name === config.staffRole)?.id || guild.ownerId}>`, inline: true }
            )
            .setColor(typeConfig.color)
            .setFooter({ text: '💎 Nossa Loja - Atendimento de Qualidade', iconURL: guild.iconURL() })
            .setTimestamp();

        const closeButton = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('close_ticket')
                    .setLabel('🔒 Fechar Ticket')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🔒')
            );

        // Mensagem de notificação para a equipe
        const staffMention = guild.roles.cache.find(r => r.name === config.staffRole)?.toString() || `<@${guild.ownerId}>`;
        
        await ticketChannel.send({ 
            content: `${user} ${staffMention}\n📬 **Novo ticket criado!**`,
            embeds: [ticketEmbed], 
            components: [closeButton] 
        });

        await interaction.editReply({ 
            content: `✅ **Ticket criado com sucesso!**\n🔗 Acesse: ${ticketChannel}\n\nNossa equipe te responderá em breve!` 
        });

        // Log no console
        console.log(`🎫 Novo ticket criado: ${typeConfig.name} por ${user.tag} (${user.id})`);

    } catch (error) {
        console.error('❌ Erro ao criar ticket:', error);
        await interaction.editReply({ 
            content: '❌ **Erro ao criar o ticket!**\nPor favor, tente novamente ou contate um administrador.' 
        });
    }
}

// Função para fechar tickets
async function handleCloseTicket(interaction) {
    const { channel, user, guild } = interaction;

    if (!channel.name.startsWith('ticket-')) {
        return await interaction.reply({ 
            content: '❌ Este comando só pode ser usado em canais de ticket.', 
            ephemeral: true 
        });
    }

    // Buscar o dono do ticket
    const ticketOwner = Array.from(activeTickets.entries()).find(
        ([userId, channelId]) => channelId === channel.id
    );

    // Embed de fechamento
    const closeEmbed = new EmbedBuilder()
        .setTitle('🔒 TICKET FECHADO')
        .setDescription(`Este ticket foi fechado por ${user}`)
        .addFields(
            { name: '⏰ Duração', value: `Criado há algum tempo` },
            { name: '👤 Cliente', value: ticketOwner ? `<@${ticketOwner[0]}>` : 'Não identificado' },
            { name: '🔧 Fechado por', value: `${user}`, inline: true }
        )
        .setColor(0xe74c3c)
        .setTimestamp();

    await interaction.reply({ 
        content: '🔒 **Fechando ticket em 5 segundos...**', 
        embeds: [closeEmbed] 
    });

    // Remover da lista de tickets ativos
    if (ticketOwner) {
        activeTickets.delete(ticketOwner[0]);
    }

    // Fechar canal após 5 segundos
    setTimeout(async () => {
        try {
            await channel.delete('Ticket fechado pelo usuário');
            console.log(`🔒 Ticket fechado: ${channel.name} por ${user.tag}`);
        } catch (error) {
            console.error('Erro ao deletar canal:', error);
        }
    }, 5000);
}

// Comando para ver tickets ativos (apenas staff)
client.on('messageCreate', async (message) => {
    if (message.content === '!tickets' && 
        (message.member.roles.cache.some(r => r.name === config.staffRole) || 
         message.member.permissions.has(PermissionsBitField.Flags.Administrator))) {
        
        if (activeTickets.size === 0) {
            return message.reply('📭 Não há tickets ativos no momento.');
        }

        const ticketsList = Array.from(activeTickets.entries())
            .map(([userId, channelId]) => {
                const channel = message.guild.channels.cache.get(channelId);
                const user = client.users.cache.get(userId);
                return `• ${channel ? channel.toString() : 'Canal não encontrado'} - ${user ? user.tag : 'Usuário não encontrado'}`;
            })
            .join('\n');

        const embed = new EmbedBuilder()
            .setTitle('📋 TICKETS ATIVOS')
            .setDescription(ticketsList)
            .setColor(0x9b59b6)
            .setFooter({ text: `Total: ${activeTickets.size} tickets abertos` });

        await message.channel.send({ embeds: [embed] });
    }
});

// Tratamento de erros para manter o bot online
process.on('unhandledRejection', (error) => {
    console.error('❌ Erro não tratado:', error);
});

process.on('uncaughtException', (error) => {
    console.error('💥 Exceção não capturada:', error);
});

process.on('SIGTERM', () => {
    console.log('🔻 Recebido SIGTERM, encerrando bot...');
    client.destroy();
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🔻 Recebido SIGINT, encerrando bot...');
    client.destroy();
    process.exit(0);
});

// Iniciar bot com variável de ambiente
client.login(process.env.DISCORD_TOKEN)
    .then(() => console.log('🔑 Token validado com sucesso!'))
    .catch(error => {
        console.error('❌ Erro ao fazer login:', error);
        process.exit(1);
    });
// Verificar se o token existe
if (!process.env.DISCORD_TOKEN) {
    console.error('❌ ERRO: DISCORD_TOKEN não encontrado nas variáveis de ambiente!');
    console.log('📝 Verifique no Railway: Settings → Variables → DISCORD_TOKEN');
    process.exit(1);
}

// Verificar formato do token
if (process.env.DISCORD_TOKEN.length < 50) {
    console.error('❌ ERRO: Token parece estar incompleto ou inválido!');
    console.log('🔑 O token deve ter pelo menos 50 caracteres');
    process.exit(1);
}

console.log('🔑 Token encontrado, iniciando login...');
console.log('📋 Dica: O token começa com:', process.env.DISCORD_TOKEN.substring(0, 10) + '...');

// Iniciar bot com tratamento de erro melhorado
client.login(process.env.DISCORD_TOKEN)
    .then(() => {
        console.log('✅ Login realizado com sucesso!');
        console.log('🎉 Bot está online e funcionando!');
    })
    .catch(error => {
        console.error('❌ ERRO CRÍTICO no login:');
        console.error('💡 Possíveis causas:');
        console.error('1. Token incorreto ou expirado');
        console.error('2. Bot não foi convidado para o servidor');
        console.error('3. Permissões do Gateway Intents não ativadas');
        console.error('🔧 Solução: Verifique o token no Discord Developer Portal');
        console.error('📋 Erro detalhado:', error.message);
        process.exit(1);
    });
