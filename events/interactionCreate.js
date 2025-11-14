const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
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

    // Botão para abrir ticket
    if (interaction.isButton() && interaction.customId === 'open_ticket') {
      await handleOpenTicket(interaction);
    }

    // Seleção do tipo de ticket
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_type') {
      await handleTicketTypeSelect(interaction);
    }

    // Botões de controle do ticket
    if (interaction.isButton() && [
      'notify_user',
      'add_member',
      'claim_ticket',
      'close_ticket'
    ].includes(interaction.customId)) {
      await handleTicketControls(interaction);
    }

    // Modal para adicionar membro
    if (interaction.isModalSubmit() && interaction.customId === 'add_member_modal') {
      await handleAddMemberModal(interaction);
    }
  },
};

async function handleOpenTicket(interaction) {
  // Verificar se usuário já tem ticket aberto
  const existingTicket = Array.from(interaction.client.tickets.values())
    .find(ticket => ticket.authorId === interaction.user.id && !ticket.closed);

  if (existingTicket) {
    return await interaction.reply({
      content: `❌ Você já tem um ticket aberto! ${existingTicket.channel}`,
      ephemeral: true
    });
  }

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('ticket_type')
    .setPlaceholder('Selecione o tipo de ticket')
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel('🛒 Compras')
        .setDescription('Realizar uma compra no servidor')
        .setValue('compras'),
      new StringSelectMenuOptionBuilder()
        .setLabel('❓ Dúvidas')
        .setDescription('Tirar dúvidas sobre produtos')
        .setValue('duvidas'),
      new StringSelectMenuOptionBuilder()
        .setLabel('🤝 Parceria')
        .setDescription('Assuntos sobre parceria')
        .setValue('parceria')
    );

  const row = new ActionRowBuilder().addComponents(selectMenu);

  await interaction.reply({
    content: 'Selecione o tipo de ticket que deseja abrir:',
    components: [row],
    ephemeral: true
  });
}

async function handleTicketTypeSelect(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const ticketType = interaction.values[0];
  const guild = interaction.guild;
  const user = interaction.user;

  // Configurações por tipo
  const typeConfig = {
    compras: { color: 0x00ff00, emoji: '🛒', name: 'Compras' },
    duvidas: { color: 0xffff00, emoji: '❓', name: 'Dúvidas' },
    parceria: { color: 0x0000ff, emoji: '🤝', name: 'Parceria' }
  };

  const config = typeConfig[ticketType];

  // Criar canal do ticket
  const category = guild.channels.cache.get(process.env.CATEGORY_ID);
  const ticketNumber = Array.from(interaction.client.tickets.values())
    .filter(ticket => !ticket.closed).length + 1;

  const channelName = `${config.emoji}-${user.username}-${ticketNumber}`.toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .substring(0, 100);

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: category,
    permissionOverwrites: [
      {
        id: guild.id,
        deny: [PermissionFlagsBits.ViewChannel]
      },
      {
        id: user.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
      },
      {
        id: process.env.STAFF_ROLE_ID,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages]
      }
    ]
  });

  // Salvar ticket
  const ticketData = {
    authorId: user.id,
    type: ticketType,
    channelId: channel.id,
    createdAt: new Date(),
    closed: false,
    claimedBy: null
  };

  interaction.client.tickets.set(channel.id, ticketData);

  // Embed do ticket
  const embed = new EmbedBuilder()
    .setTitle(`${config.emoji} Ticket de ${config.name}`)
    .setDescription(`Olá ${user.toString()}!\n\nA equipe de suporte irá atendê-lo em breve.\nPor favor, descreva sua solicitação abaixo.`)
    .setColor(config.color)
    .addFields(
      { name: '👤 Autor', value: user.toString(), inline: true },
      { name: '📅 Criado em', value: `<t:${Math.floor(Date.now() / 1000)}:f>`, inline: true },
      { name: '🔒 Status', value: '🟢 Aberto', inline: true }
    )
    .setFooter({ text: 'Suporte • Resposta rápida' });

  // Botões de controle
  const controlRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('notify_user')
      .setLabel('Notificar')
      .setEmoji('🔔')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('add_member')
      .setLabel('Adicionar Membro')
      .setEmoji('👥')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('claim_ticket')
      .setLabel('Assumir')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('close_ticket')
      .setLabel('Fechar')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Danger)
  );

  await channel.send({
    content: `${user.toString()} <@&${process.env.STAFF_ROLE_ID}>`,
    embeds: [embed],
    components: [controlRow]
  });

  await interaction.editReply({
    content: `✅ Ticket criado com sucesso! ${channel.toString()}`
  });
}

async function handleTicketControls(interaction) {
  // Verificar se é staff
  if (!interaction.member.roles.cache.has(process.env.STAFF_ROLE_ID)) {
    return await interaction.reply({
      content: '❌ Apenas a equipe de staff pode usar estes botões!',
      ephemeral: true
    });
  }

  const ticket = interaction.client.tickets.get(interaction.channel.id);
  if (!ticket || ticket.closed) {
    return await interaction.reply({
      content: '❌ Ticket não encontrado ou já fechado!',
      ephemeral: true
    });
  }

  switch (interaction.customId) {
    case 'notify_user':
      await handleNotifyUser(interaction, ticket);
      break;
    case 'add_member':
      await handleAddMember(interaction);
      break;
    case 'claim_ticket':
      await handleClaimTicket(interaction, ticket);
      break;
    case 'close_ticket':
      await handleCloseTicket(interaction, ticket);
      break;
  }
}

async function handleNotifyUser(interaction, ticket) {
  const user = await interaction.guild.members.fetch(ticket.authorId);
  await interaction.channel.send(`🔔 ${user.toString()} - Notificação da equipe!`);
  await interaction.reply({ content: '✅ Usuário notificado!', ephemeral: true });
}

async function handleAddMember(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('add_member_modal')
    .setTitle('Adicionar Membro ao Ticket');

  const memberInput = new TextInputBuilder()
    .setCustomId('member_id')
    .setLabel('ID do Membro')
    .setPlaceholder('Digite o ID do usuário...')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const row = new ActionRowBuilder().addComponents(memberInput);
  modal.addComponents(row);

  await interaction.showModal(modal);
}

async function handleAddMemberModal(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const memberId = interaction.fields.getTextInputValue('member_id');
  
  try {
    const member = await interaction.guild.members.fetch(memberId);
    
    await interaction.channel.permissionOverwrites.create(member, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true
    });

    await interaction.channel.send(`👥 ${member.toString()} foi adicionado ao ticket por ${interaction.user.toString()}`);
    await interaction.editReply({ content: `✅ ${member.toString()} adicionado ao ticket!` });
  } catch (error) {
    await interaction.editReply({ content: '❌ Membro não encontrado! Verifique o ID.' });
  }
}

async function handleClaimTicket(interaction, ticket) {
  if (ticket.claimedBy) {
    return await interaction.reply({
      content: `❌ Este ticket já está sendo atendido por <@${ticket.claimedBy}>!`,
      ephemeral: true
    });
  }

  ticket.claimedBy = interaction.user.id;
  interaction.client.tickets.set(interaction.channel.id, ticket);

  await interaction.reply({
    content: `✅ Ticket assumido por ${interaction.user.toString()}`
  });
}

async function handleCloseTicket(interaction, ticket) {
  await interaction.deferReply();

  // Marcar como fechado
  ticket.closed = true;
  ticket.closedAt = new Date();
  ticket.closedBy = interaction.user.id;
  interaction.client.tickets.set(interaction.channel.id, ticket);

  // Gerar logs
  await generateTicketLogs(interaction, ticket);

  const embed = new EmbedBuilder()
    .setTitle('🔒 Ticket Fechado')
    .setDescription('Este ticket será excluído em 10 segundos...')
    .setColor(0xff0000);

  await interaction.editReply({ embeds: [embed] });

  // Esperar e deletar canal
  setTimeout(async () => {
    try {
      await interaction.channel.delete();
    } catch (error) {
      console.error('Erro ao deletar canal:', error);
    }
  }, 10000);
}

async function generateTicketLogs(interaction, ticket) {
  const logChannel = interaction.guild.channels.cache.get(process.env.LOG_CHANNEL_ID);
  const author = await interaction.guild.members.fetch(ticket.authorId).catch(() => null);
  const closer = await interaction.guild.members.fetch(ticket.closedBy).catch(() => null);

  // Log no canal de logs
  const logEmbed = new EmbedBuilder()
    .setTitle('📋 Log do Ticket Fechado')
    .setColor(0xff0000)
    .setTimestamp()
    .addFields(
      { name: '👤 Autor', value: author?.toString() || 'Não encontrado', inline: true },
      { name: '📝 Tipo', value: ticket.type.charAt(0).toUpperCase() + ticket.type.slice(1), inline: true },
      { name: '⏰ Criado em', value: `<t:${Math.floor(ticket.createdAt.getTime() / 1000)}:f>`, inline: true },
      { name: '🔒 Fechado por', value: closer?.toString() || 'Não informado', inline: true },
      { name: '⏰ Fechado em', value: `<t:${Math.floor(ticket.closedAt.getTime() / 1000)}:f>`, inline: true },
      { name: '🔢 Canal', value: interaction.channel.name, inline: true }
    );

  await logChannel.send({ embeds: [logEmbed] });

  // Tentar enviar DM para o autor
  if (author) {
    try {
      const userEmbed = new EmbedBuilder()
        .setTitle('📋 Seu Ticket foi Fechado')
        .setDescription(`Ticket **${ticket.type}** no canal **${interaction.channel.name}** foi fechado.`)
        .setColor(0xff0000)
        .addFields(
          { name: '🔒 Fechado por', value: closer?.displayName || 'Staff', inline: true },
          { name: '⏰ Fechado em', value: `<t:${Math.floor(ticket.closedAt.getTime() / 1000)}:f>`, inline: true }
        );

      await author.send({ embeds: [userEmbed] });
    } catch (error) {
      // Usuário com DM fechada
    }
  }
}
