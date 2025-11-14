const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup-ticket')
    .setDescription('Configura o sistema de tickets no canal atual'),
  
  async execute(interaction) {
    // Verificar permissões
    if (!interaction.member.roles.cache.has(process.env.STAFF_ROLE_ID)) {
      return await interaction.reply({
        content: '❌ Você não tem permissão para usar este comando!',
        ephemeral: true
      });
    }

    const embed = new EmbedBuilder()
      .setTitle('🎫 Sistema de Suporte')
      .setDescription('**Clique no botão abaixo para abrir um ticket!**\n\nNossa equipe está pronta para te ajudar com:')
      .setColor(0x5865F2)
      .addFields(
        { name: '🛒 Compras', value: 'Realizar compras no servidor', inline: true },
        { name: '❓ Dúvidas', value: 'Tirar dúvidas sobre produtos', inline: true },
        { name: '🤝 Parceria', value: 'Propostas de parceria', inline: true }
      )
      .setFooter({ text: 'Suporte 24/7 • Resposta rápida' });

    const button = new ButtonBuilder()
      .setCustomId('open_ticket')
      .setLabel('Abrir Ticket')
      .setEmoji('🎫')
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(button);

    await interaction.channel.send({ embeds: [embed], components: [row] });
    
    await interaction.reply({
      content: '✅ Sistema de tickets configurado com sucesso!',
      ephemeral: true
    });
  },
};
