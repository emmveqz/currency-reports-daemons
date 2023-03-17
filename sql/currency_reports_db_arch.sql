
-- WHILE ON root SESSION
-- CREDENTIALS TAKEN FROM /config/vars
CREATE DATABASE IF NOT EXISTS _DBSCHEMA;

-- This is equivalent to `CREATE USER IF NOT EXISTS`
GRANT ALL PRIVILEGES ON _DBSCHEMA.* TO '_DBUSER'@'_DBHOST' IDENTIFIED BY '_DBPASS';
FLUSH PRIVILEGES;
USE _DBSCHEMA;
-- END


-- ###########################################################


CREATE TABLE IF NOT EXISTS `AlertSuscription`(
	`Id` BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,

	`Currency` TINYINT NOT NULL,
	`CurrentRate` DECIMAL(18, 8) NOT NULL,
	`Email` VARCHAR(80) NOT NULL DEFAULT '',
	`Basis` SMALLINT NOT NULL DEFAULT 0,
	`Type` SMALLINT NOT NULL DEFAULT 0,
	`TimesToRepeat` SMALLINT NOT NULL DEFAULT 0,
	`Factor` DECIMAL(18, 8) NOT NULL,
	`TimesToRemind` SMALLINT NOT NULL DEFAULT 0,
	`LastAlertDate` TIMESTAMP NOT NULL DEFAULT '0000-00-00 00:00:00',
	`PhoneNumber` VARCHAR(24) NOT NULL DEFAULT '',
	`Memo` VARCHAR(120) NOT NULL DEFAULT '',

	`CreatedByUserId` BIGINT(20) UNSIGNED NOT NULL,
	`CreationDate` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

	PRIMARY KEY (`Id`),
	KEY `Currency` (`Currency`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;


-- ###########################################################


CREATE TABLE IF NOT EXISTS `CurrencyRateTick`(
	`Id` BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,

	`Currency` TINYINT NOT NULL,
	`Rate` DECIMAL(18, 8) NOT NULL,
	`Volume` INT NOT NULL DEFAULT 0,

	`CreatedByUserId` BIGINT(20) UNSIGNED NOT NULL,
	`CreationDate` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

	PRIMARY KEY (`Id`),
	KEY `Currency` (`Currency`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;


-- ###########################################################


CREATE TABLE IF NOT EXISTS `UserAction`(
	`Id` BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,

	`UserIp` VARCHAR(20) NOT NULL,
	`Action` VARCHAR(120) NOT NULL DEFAULT '',
	`Params` TEXT NOT NULL DEFAULT '',
	`Result` TEXT NOT NULL DEFAULT '',
	`Notes` TEXT NOT NULL DEFAULT '',

	`CreatedByUserId` BIGINT(20) UNSIGNED NOT NULL,
	`CreationDate` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

	PRIMARY KEY (`Id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;


-- ###########################################################


CREATE VIEW `ActiveAlertsSimple`
AS
SELECT
	`Id`,
	`Currency`,
	`CurrentRate` AS `Rate`,
	`Type`,
	`Factor`,
	`CreationDate` AS `Date`
FROM `AlertSuscription`
WHERE `TimesToRepeat` OR `TimesToRemind`;


-- ###########################################################


CREATE VIEW `ActiveAlerts`
AS
SELECT
	`a`.`Id` AS `Id`,
	`c`.`Symbol` AS `Symbol`,
	`a`.`CurrentRate` AS `Rate`,
	IF(`a`.`Type` = 2,'down','up') AS `Type`,
	`a`.`TimesToRepeat` AS `Repeat`,
	`a`.`Factor` AS `Factor`,
	`a`.`TimesToRemind` AS `Remind`,
	`a`.`LastAlertDate` AS `LastAlert`,
	`a`.`CreationDate` AS `Date`
FROM `AlertSuscription` `a` JOIN `Currency` `c` ON `c`.`Id` = `a`.`Currency`
WHERE `a`.`TimesToRepeat` OR `a`.`TimesToRemind`
ORDER BY `c`.`Symbol`,`a`.`Id`
DESC;


