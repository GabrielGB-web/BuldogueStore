const { ChannelType, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const ticketDB = new Map();

module.exports = {
    name: 'interactionCreate',
    async execute(interaction) {
        // Botão fixo para abrir menu de tickets
        if (interaction.isButton() && interaction.customId === 'open-ticket-menu') {
            await handleTicketMenu(interaction);
        }

        // Menu de seleção de tipo de ticket
        if (interaction.isStringSelectMenu() && interaction.customId === 'ticket-select') {
            await handleTicketCreation(interaction);
        }

        // Botões dentro do ticket
        if (interaction.isButton() && [
            'notify-user', 
            'add-member', 
            'claim-ticket', 
            'close-ticket',
            'transcript-ticket'
        ].includes(interaction.customId)) {
            await handleTicketButtons(interaction);
        }

        // Modal para adicionar membro
        if (interaction.isModalSubmit() && interaction.customId === 'add-member-modal') {
            await handleAddMemberModal(interaction);
        }
    }
};

async function handleTicketMenu(interaction) {
    const embed = new EmbedBuilder()
        .setTitle('🎫 Selecione o Tipo de Ticket')
        .setDescription('Escolha abaixo o tipo de atendimento que você precisa:')
        .setColor(0x0099FF)
        .setFooter({ text: 'Selecione uma opção no menu abaixo' });

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('ticket-select')
        .setPlaceholder('Selecione o tipo de ticket')
        .addOptions([
            {
                label: 'Denúncias',
                description: 'Fazer denúncia ou recorrer a uma denúncia',
                value: 'denuncias',
                emoji: '🚨'
            },
            {
                label: 'Suporte',
                description: 'Tirar dúvidas ou recorrer a banimento',
                value: 'suporte',
                emoji: '❓'
            },
            {
                label: 'Loja',
                description: 'Assuntos sobre compra na loja',
                value: 'loja',
                emoji: '🛒'
            },
            {
                label: 'Falar com CEO',
                description: 'Comunicação direta com a administração',
                value: 'ceo',
                emoji: '👑'
            }
        ]);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

async function handleTicketCreation(interaction) {
    const ticketType = interaction.values[0];
    const user = interaction.user;
    const guild = interaction.guild;

    // Configurações para cada tipo de ticket
    const ticketConfigs = {
        denuncias: {
            name: '🚨・denúncia',
            categoryName: '🚨 Denúncias',
            staffRole: 'Staff Denúncias',
            color: 0xFF0000
        },
        suporte: {
            name: '❓・suporte',
            categoryName: '❓ Suporte',
            staffRole: 'Staff Suporte',
            color: 0x0099FF
        },
        loja: {
            name: '🛒・loja',
            categoryName: '🛒 Loja',
            staffRole: 'Staff Loja',
            color: 0xFFA500
        },
        ceo: {
            name: '👑・ceo',
            categoryName: '👑 CEO',
            staffRole: 'CEO',
            color: 0xFFD700
        }
    };

    const config = ticketConfigs[ticketType];

    // Verificar se já existe ticket aberto
    const existingTicket = Array.from(ticketDB.values()).find(
        ticket => ticket.userId === user.id && ticket.guildId === guild.id && !ticket.closed
    );

    if (existingTicket) {
        return await interaction.reply({ 
            content: '❌ Você já possui um ticket aberto! Por favor, aguarde o atendimento no ticket existente.', 
            ephemeral: true 
        });
    }

    try {
        // Encontrar ou criar categoria
        let category = guild.channels.cache.find(
            channel => channel.name === config.categoryName && channel.type === ChannelType.GuildCategory
        );

        if (!category) {
            category = await guild.channels.create({
                name: config.categoryName,
                type: ChannelType.GuildCategory,
                permissionOverwrites: [
                    {
                        id: guild.id,
                        deny: [PermissionsBitField.Flags.ViewChannel]
                    }
                ]
            });
        }

        // Criar canal do ticket
        const ticketChannel = await guild.channels.create({
            name: `${config.name}-${user.username}`.toLowerCase().slice(0, 100),
            type: ChannelType.GuildText,
            parent: category.id,
            topic: `Ticket de ${ticketType} - Aberto por: ${user.tag} | ${new Date().toLocaleString('pt-BR')}`,
            permissionOverwrites: [
                {
                    id: guild.id,
                    deny: [PermissionsBitField.Flags.ViewChannel]
                },
                {
                    id: user.id,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.SendMessages,
                        PermissionsBitField.Flags.ReadMessageHistory,
                        PermissionsBitField.Flags.AttachFiles,
                        PermissionsBitField.Flags.EmbedLinks
                    ]
                }
            ]
        });

        // Adicionar permissões para staff
        const staffRole = guild.roles.cache.find(role => role.name === config.staffRole);
        if (staffRole) {
            await ticketChannel.permissionOverwrites.edit(staffRole, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true,
                ManageMessages: true,
                ManageChannels: true
            });
        }

        // Salvar no banco de dados
        const ticketData = {
            channelId: ticketChannel.id,
            userId: user.id,
            guildId: guild.id,
            type: ticketType,
            staffRole: config.staffRole,
            closed: false,
            claimedBy: null,
            createdAt: new Date()
        };
        ticketDB.set(ticketChannel.id, ticketData);

        // Embed do ticket
        const ticketEmbed = new EmbedBuilder()
            .setTitle(`Ticket - ${ticketType.toUpperCase()}`)
            .setDescription(`Olá ${user}! A equipe de suporte irá te ajudar em breve.\n\nPor favor, descreva seu problema detalhadamente.`)
            .addFields(
                { name: '👤 Aberto por', value: `${user.tag} (${user.id})`, inline: true },
                { name: '🎫 Tipo', value: ticketType, inline: true },
                { name: '📅 Data', value: new Date().toLocaleString('pt-BR'), inline: true }
            )
            .setColor(config.color)
            .setFooter({ text: 'Sistema de Tickets - Aguarde atendimento' });

        // Botões para ações do ticket
        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('notify-user')
                .setLabel('📢 Notificar')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('add-member')
                .setLabel('➕ Adicionar Membro')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('claim-ticket')
                .setLabel('👤 Assumir Ticket')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('transcript-ticket')
                .setLabel('📄 Transcript')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('close-ticket')
                .setLabel('🔒 Fechar')
                .setStyle(ButtonStyle.Danger)
        );

        await ticketChannel.send({ 
            content: `${user} ${staffRole ? `<@&${staffRole.id}>` : ''}\n**Ticket criado com sucesso!**`,
            embeds: [ticketEmbed], 
            components: [buttons] 
        });

        await interaction.reply({ 
            content: `✅ Ticket criado com sucesso! Acesse: ${ticketChannel}`, 
            ephemeral: true 
        });

    } catch (error) {
        console.error('Erro ao criar ticket:', error);
        await interaction.reply({ 
            content: '❌ Erro ao criar o ticket. Por favor, tente novamente ou contate um administrador.', 
            ephemeral: true 
        });
    }
}

// ... (outras funções handleTicketButtons, notifyUser, etc. mantêm iguais ao código anterior)
// Adicione a função handleAddMemberModal:

async function handleAddMemberModal(interaction) {
    const userId = interaction.fields.getTextInputValue('userId');
    const ticketData = ticketDB.get(interaction.channel.id);
    
    if (!ticketData) return;

    try {
        const member = await interaction.guild.members.fetch(userId);
        await interaction.channel.permissionOverwrites.edit(member, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true
        });

        await interaction.reply({ 
            content: `✅ ${member} foi adicionado ao ticket!`, 
            ephemeral: false 
        });
    } catch (error) {
        await interaction.reply({ 
            content: '❌ Não foi possível encontrar o usuário. Verifique o ID fornecido.', 
            ephemeral: true 
        });
    }
}
