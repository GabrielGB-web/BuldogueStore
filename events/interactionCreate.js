const { 
    ChannelType, 
    PermissionsBitField, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    EmbedBuilder, 
    StringSelectMenuBuilder, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle 
} = require('discord.js');

const ticketDB = new Map(); // Em produção, use um banco de dados real

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

        // Comandos de slash
        if (interaction.isChatInputCommand()) {
            const command = interaction.client.commands.get(interaction.commandName);

            if (!command) return;

            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(error);
                await interaction.reply({ 
                    content: '❌ Ocorreu um erro ao executar este comando!', 
                    ephemeral: true 
                });
            }
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
                ManageChannels: true,
                EmbedLinks: true,
                AttachFiles: true
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

async function handleTicketButtons(interaction) {
    const ticketData = ticketDB.get(interaction.channel.id);
    
    if (!ticketData) {
        return await interaction.reply({ 
            content: '❌ Este canal não é um ticket válido ou os dados foram perdidos.', 
            ephemeral: true 
        });
    }

    // Verificar permissões (apenas staff pode usar os botões)
    const hasPermission = interaction.member.roles.cache.some(role => 
        role.name === ticketData.staffRole || interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)
    );

    if (!hasPermission) {
        return await interaction.reply({ 
            content: '❌ Você não tem permissão para usar este comando! Apenas staff pode usar os botões do ticket.', 
            ephemeral: true 
        });
    }

    switch (interaction.customId) {
        case 'notify-user':
            await notifyUser(interaction, ticketData);
            break;
        
        case 'add-member':
            await addMember(interaction, ticketData);
            break;
        
        case 'claim-ticket':
            await claimTicket(interaction, ticketData);
            break;

        case 'transcript-ticket':
            await transcriptTicket(interaction, ticketData);
            break;
        
        case 'close-ticket':
            await closeTicket(interaction, ticketData);
            break;
    }
}

async function notifyUser(interaction, ticketData) {
    try {
        const user = await interaction.guild.members.fetch(ticketData.userId);
        const notifyEmbed = new EmbedBuilder()
            .setTitle('📢 Notificação do Staff')
            .setDescription(`${user}, por favor, aguarde atendimento. Um membro da equipe irá te ajudar em breve.\n\nSe você tiver mais informações para adicionar, por favor, compartilhe agora.`)
            .setColor(0x00FF00)
            .setTimestamp();

        await interaction.channel.send({ 
            content: `${user}`,
            embeds: [notifyEmbed] 
        });
        await interaction.reply({ content: '✅ Usuário notificado com sucesso!', ephemeral: true });
    } catch (error) {
        await interaction.reply({ 
            content: '❌ Erro ao notificar o usuário. O usuário pode ter saído do servidor.', 
            ephemeral: true 
        });
    }
}

async function addMember(interaction, ticketData) {
    // Criar modal para adicionar membro
    const modal = new ModalBuilder()
        .setCustomId('add-member-modal')
        .setTitle('Adicionar Membro ao Ticket');

    const userIdInput = new TextInputBuilder()
        .setCustomId('userId')
        .setLabel('ID do Usuário para Adicionar')
        .setPlaceholder('Digite o ID do usuário...')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

    const actionRow = new ActionRowBuilder().addComponents(userIdInput);
    modal.addComponents(actionRow);

    await interaction.showModal(modal);
}

async function handleAddMemberModal(interaction) {
    const userId = interaction.fields.getTextInputValue('userId');
    const ticketData = ticketDB.get(interaction.channel.id);
    
    if (!ticketData) return;

    try {
        const member = await interaction.guild.members.fetch(userId.trim());
        
        await interaction.channel.permissionOverwrites.edit(member, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
            AttachFiles: true,
            EmbedLinks: true
        });

        const successEmbed = new EmbedBuilder()
            .setTitle('✅ Membro Adicionado')
            .setDescription(`${member} foi adicionado ao ticket com sucesso!`)
            .setColor(0x00FF00)
            .setTimestamp();

        await interaction.reply({ 
            embeds: [successEmbed]
        });

        // Notificar no ticket sobre o novo membro
        const notifyEmbed = new EmbedBuilder()
            .setTitle('👤 Novo Membro no Ticket')
            .setDescription(`${member} foi adicionado ao ticket por ${interaction.user}`)
            .setColor(0x0099FF)
            .setTimestamp();

        await interaction.channel.send({ embeds: [notifyEmbed] });

    } catch (error) {
        console.error('Erro ao adicionar membro:', error);
        const errorEmbed = new EmbedBuilder()
            .setTitle('❌ Erro ao Adicionar Membro')
            .setDescription('Não foi possível encontrar o usuário. Verifique se o ID está correto e se o usuário está no servidor.')
            .setColor(0xFF0000)
            .setTimestamp();

        await interaction.reply({ 
            embeds: [errorEmbed],
            ephemeral: true 
        });
    }
}

async function claimTicket(interaction, ticketData) {
    if (ticketData.claimedBy) {
        try {
            const claimedBy = await interaction.guild.members.fetch(ticketData.claimedBy);
            return await interaction.reply({ 
                content: `❌ Este ticket já foi assumido por ${claimedBy}`, 
                ephemeral: true 
            });
        } catch (error) {
            // Se não conseguir encontrar o membro, limpa o claimedBy
            ticketData.claimedBy = null;
        }
    }

    ticketData.claimedBy = interaction.user.id;
    ticketDB.set(interaction.channel.id, ticketData);

    const claimEmbed = new EmbedBuilder()
        .setTitle('🎯 Ticket Assumido')
        .setDescription(`${interaction.user} assumiu este ticket e irá te ajudar.`)
        .setColor(0x00FF00)
        .addFields(
            { name: '👤 Staff Responsável', value: `${interaction.user.tag}`, inline: true },
            { name: '⏰ Horário', value: new Date().toLocaleString('pt-BR'), inline: true }
        )
        .setTimestamp();

    await interaction.channel.send({ embeds: [claimEmbed] });
    await interaction.reply({ content: '✅ Ticket assumido com sucesso!', ephemeral: true });
}

async function transcriptTicket(interaction, ticketData) {
    // Função simplificada para transcript
    // Em produção, implemente um sistema completo de transcript
    try {
        const messages = await interaction.channel.messages.fetch({ limit: 100 });
        let transcript = `Transcript do Ticket - ${ticketData.type}\n`;
        transcript += `Aberto por: ${ticketData.userId}\n`;
        transcript += `Data: ${new Date().toLocaleString('pt-BR')}\n`;
        transcript += `Canal: ${interaction.channel.name}\n\n`;
        transcript += 'Mensagens:\n\n';

        messages.reverse().forEach(message => {
            const timestamp = new Date(message.createdTimestamp).toLocaleString('pt-BR');
            transcript += `[${timestamp}] ${message.author.tag}: ${message.content}\n`;
        });

        // Em produção, salve em um arquivo e envie para um canal de logs
        await interaction.reply({ 
            content: '📄 Transcript gerado (funcionalidade básica). Em produção, isso salvaria em um arquivo.',
            ephemeral: true 
        });

        console.log('Transcript:', transcript); // Apenas para demonstração

    } catch (error) {
        console.error('Erro ao gerar transcript:', error);
        await interaction.reply({ 
            content: '❌ Erro ao gerar transcript.', 
            ephemeral: true 
        });
    }
}

async function closeTicket(interaction, ticketData) {
    if (ticketData.closed) {
        return await interaction.reply({ 
            content: '❌ Este ticket já está fechado.', 
            ephemeral: true 
        });
    }

    const closeEmbed = new EmbedBuilder()
        .setTitle('🔒 Ticket Fechado')
        .setDescription(`Este ticket foi fechado por ${interaction.user.tag}`)
        .addFields(
            { name: '👤 Fechado por', value: `${interaction.user.tag}`, inline: true },
            { name: '🎫 Tipo', value: ticketData.type, inline: true },
            { name: '⏰ Duração', value: calculateDuration(ticketData.createdAt), inline: true },
            { name: '📅 Data de Abertura', value: ticketData.createdAt.toLocaleString('pt-BR'), inline: false }
        )
        .setColor(0xFF0000)
        .setTimestamp();

    // Desativar botões
    const disabledButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('notify-user')
            .setLabel('📢 Notificar')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId('add-member')
            .setLabel('➕ Adicionar Membro')
            .setStyle(ButtonStyle.Success)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId('claim-ticket')
            .setLabel('👤 Assumir Ticket')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId('transcript-ticket')
            .setLabel('📄 Transcript')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId('close-ticket')
            .setLabel('🔒 Fechado')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(true)
    );

    // Atualizar mensagem original com botões desativados
    const messages = await interaction.channel.messages.fetch({ limit: 10 });
    const originalMessage = messages.find(msg => msg.components.length > 0);
    
    if (originalMessage) {
        try {
            await originalMessage.edit({ components: [disabledButtons] });
        } catch (error) {
            console.error('Erro ao desativar botões:', error);
        }
    }

    await interaction.channel.send({ embeds: [closeEmbed] });
    
    // Marcar como fechado no banco de dados
    ticketData.closed = true;
    ticketData.closedAt = new Date();
    ticketData.closedBy = interaction.user.id;
    ticketDB.set(interaction.channel.id, ticketData);

    await interaction.reply({ content: '✅ Ticket fechado com sucesso! O canal será deletado em 10 segundos...', ephemeral: true });

    // Fechar canal após 10 segundos
    setTimeout(async () => {
        try {
            await interaction.channel.delete('Ticket fechado pelo sistema');
            ticketDB.delete(interaction.channel.id);
        } catch (error) {
            console.error('Erro ao deletar canal:', error);
        }
    }, 10000);
}

function calculateDuration(startDate) {
    const diff = new Date() - startDate;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else {
        return `${minutes}m`;
    }
}
