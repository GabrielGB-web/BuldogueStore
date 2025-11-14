const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup-ticket')
        .setDescription('Configurar o sistema de tickets em um canal')
        .addChannelOption(option =>
            option.setName('canal')
                .setDescription('Canal onde o sistema de tickets será configurado')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction) {
        const channel = interaction.options.getChannel('canal');
        
        const embed = new EmbedBuilder()
            .setTitle('🎫 Sistema de Tickets')
            .setDescription('Clique no botão abaixo para abrir um ticket!')
            .setColor(0x0099FF)
            .addFields(
                { name: '🚨 Denúncias', value: 'Fazer denúncia ou recorrer a uma denúncia', inline: true },
                { name: '❓ Suporte', value: 'Tirar dúvidas ou recorrer a banimento', inline: true },
                { name: '🛒 Loja', value: 'Assuntos sobre compra na loja', inline: true },
                { name: '👑 Falar com CEO', value: 'Comunicação direta com a administração', inline: true }
            )
            .setFooter({ text: 'Selecione o tipo de ticket ao clicar no botão' });

        const button = new ButtonBuilder()
            .setCustomId('open-ticket-menu')
            .setLabel('Abrir Ticket')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🎫');

        const row = new ActionRowBuilder().addComponents(button);

        try {
            await channel.send({ embeds: [embed], components: [row] });
            await interaction.reply({ 
                content: `✅ Sistema de tickets configurado com sucesso em ${channel}!`, 
                ephemeral: true 
            });
        } catch (error) {
            console.error(error);
            await interaction.reply({ 
                content: '❌ Erro ao configurar o sistema de tickets. Verifique as permissões do bot.', 
                ephemeral: true 
            });
        }
    }
};
