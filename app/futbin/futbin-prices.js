/* eslint-disable linebreak-style */
/* globals
$
window
*/

import { utils } from '../../fut';
import { BaseScript } from '../core';
import { FutbinSettings } from './settings-entry';

export class FutbinPrices extends BaseScript {
  constructor() {
    super(FutbinSettings.id);
  }

  activate(state) {
    super.activate(state);

    this._show(state.screenId);
  }

  onScreenRequest(screenId) {
    super.onScreenRequest(screenId);
    this._show(screenId);
  }

  deactivate(state) {
    super.deactivate(state);

    $('.futbin').remove();

    if (this._intervalRunning) {
      clearInterval(this._intervalRunning);
    }
  }

  _show(screen) {
    const showFutbinPricePages = [
      'UTTransferListSplitViewController', // transfer list
      'UTWatchListSplitViewController', // transfer targets
      'UTUnassignedItemsSplitViewController', // pack buy
      'ClubSearchResultsSplitViewController', // club
      'UTMarketSearchResultsSplitViewController', // market search
    ];

    if (showFutbinPricePages.indexOf(screen) !== -1) {
      if (this._intervalRunning) {
        clearInterval(this._intervalRunning);
      }
      this._intervalRunning = setInterval(() => {
        if (showFutbinPricePages.indexOf(window.currentPage) === -1) {
          if (this._intervalRunning) {
            clearInterval(this._intervalRunning);
          }
          return;
        }
        const controller = getAppMain().getRootViewController()
          .getPresentedViewController().getCurrentViewController()
          .getCurrentController();

        const uiItems = $(getAppMain().getRootViewController()
          .getPresentedViewController().getCurrentViewController()
          ._view.__root).find('.listFUTItem');

        const targetForButton = uiItems.find('.auction');
        if (targetForButton !== null) {
          targetForButton.show(); // make sure it's always shown (#69)
        }

        if ($(uiItems[0]).find('.futbin').length > 0) {
          return;
        }

        let listController = null;
        if (screen === 'UTUnassignedItemsSplitViewController' || screen === 'UTWatchListSplitViewController') {
          if (!controller ||
            !controller._leftController ||
            !controller._leftController._view) {
            return;
          }
          listController = controller._leftController;
        } else {
          if (!controller ||
            !controller._listController ||
            !controller._listController._view) {
            return; // only run if data is available
          }
          listController = controller._listController;
        }

        let listrows = null;
        if (listController._view._list &&
          listController._view._list._listRows &&
          listController._view._list._listRows.length > 0) {
          listrows = listController._view._list._listRows; // for transfer market and club search
        } else if (listController._view._sections &&
          listController._view._sections.length > 0) { // for transfer list & trade pile
          listController._view._sections.forEach((row) => {
            if (row._listRows.length > 0) {
              if (listrows == null) {
                listrows = row._listRows;
              } else {
                listrows = listrows.concat(row._listRows);
              }
            }
          });
        }

        if (listrows === null) {
          return;
        }

        const showBargains = (this.getSettings()['show-bargains'] === 'true');
        const minProfit = this.getSettings()['min-profit'];

        const resourceIdMapping = [];
        listrows.forEach((row, index) => {
          resourceIdMapping.push({
            target: uiItems[index],
            playerId: row.data.resourceId,
            item: row.data,
          });
        });

        const futbinUrl = `https://www.futbin.com/19/playerPrices?player=&all_versions=${
          resourceIdMapping
            .map(i => i.playerId)
            .filter((current, next) => current !== next)
            .join(',')
        }`;
        GM_xmlhttpRequest({
          method: 'GET',
          url: futbinUrl,
          onload: (res) => {
            const futbinData = JSON.parse(res.response);
            resourceIdMapping.forEach((item) => {
              FutbinPrices._showFutbinPrice(item, futbinData, showBargains, minProfit);
            });
            console.log('======');
          },
        });
      }, 1000);
    } else {
      // no need to search prices on other pages
      // reset page
      if (this._intervalRunning) {
        clearInterval(this._intervalRunning);
      }
      this._intervalRunning = null;
    }
  }

  static getColor(item, futbinData) {
    const { playerId } = item;
    const type = (item.item.rating < 75) ? 'silver' : 'gold';
    const platform = utils.getPlatform();

    const updated = futbinData[playerId].prices[platform].updated.split(' ');
    if ((updated[1] === 'mins') || (updated[1] === 'hour')) {
      const price = +futbinData[playerId].prices[platform].LCPrice.replace(',', '');

      const bid = (item.item._auction.currentBid > 0)
        ? item.item._auction.currentBid
        : item.item._auction.startingBid;

      const profit = (+futbinData[playerId].prices[platform].LCPrice.replace(',', '') - bid) * 0.95;

      const compareValue = profit / bid;
      const averageValue = profit - bid;

      const color = FutbinPrices.calcCompareValue(type, compareValue, averageValue);

      if (color) {
        console.log(playerId, price, bid, compareValue, color);
      }

      return color;
    }

    return undefined;
  }

  static calcCompareValue(type, compareValue, averageValue) {
    const ranks = [
      { code: 'futbin-bargain1', factor: 11, value: 11000 },
      { code: 'futbin-bargain2', factor: 7, value: 7000 },
      { code: 'futbin-bargain3', factor: 5, value: 3000 },
      { code: 'futbin-bargain4', factor: 3, value: 1000 },
    ];

    if (type === 'silver') {
      for (let i = 0; i < ranks.length - 1; i += 1) {
        const { code, factor } = ranks[i];
        if (compareValue > factor) {
          return code;
        }
      }
    }

    if (type === 'gold') {
      for (let i = 0; i < ranks.length; i += 1) {
        const { code, value } = ranks[i];
        if (averageValue > value) {
          return code;
        }
      }
    }

    return undefined;
  }

  static async _showFutbinPrice(item, futbinData, showBargain) {
    if (!futbinData) {
      return;
    }
    const platform = utils.getPlatform();
    const target = $(item.target);
    const { playerId } = item;
    const bid = (item.item._auction.currentBid > 0)
      ? item.item._auction.currentBid
      : item.item._auction.startingBid;
    const profit = (+futbinData[playerId].prices[platform].LCPrice.replace(',', '') - bid) * 0.95;

    if (target.find('.player').length === 0) {
      // not a player
      return;
    }

    if (!futbinData[playerId]) {
      return; // futbin data might not be available for this player
    }

    let targetForButton = null;

    if (showBargain) {
      const color = FutbinPrices.getColor(item, futbinData);
      const colorClass = `${color}`;
      target.addClass(colorClass);
    }

    if (target.find('.futbin').length > 0) {
      return; // futbin price already added to the row
    }

    if (target.find('.profit').length > 0) {
      return; // futbin price already added to the row
    }

    const futbinText = 'Futbin BIN';
    const profitText = 'Profit';
    switch (window.currentPage) {
      case 'UTTransferListSplitViewController':
      case 'UTWatchListSplitViewController':
      case 'UTUnassignedItemsSplitViewController':
      case 'ClubSearchResultsSplitViewController':
      case 'UTMarketSearchResultsSplitViewController':
        $('.secondary.player-stats-data-component').css('float', 'left');
        targetForButton = target.find('.auction');
        targetForButton.show();
        targetForButton.prepend(`
        <div class="auctionValue futbin">
          <span class="label">${futbinText}</span>
          <span class="coins value">${futbinData[playerId].prices[platform].LCPrice}</span>
          <span class="time" style="color: #acacc4;">${futbinData[playerId].prices[platform].updated}</span>
          <span class="label">${profitText}</span>
          <span class="coins value">${profit}</span>
        </div>`);
        break;
      case 'SearchResults':
        targetForButton = target.find('.auctionValue').parent();
        targetForButton.prepend(`
        <div class="auctionValue futbin">
          <span class="label">${futbinText}</span>
          <span class="coins value">${futbinData[playerId].prices[platform].LCPrice}</span>
          <span class="time" style="color: #acacc4;">${futbinData[playerId].prices[platform].updated}</span>
          <span class="label">${profitText}</span>
          <span class="coins value">${profit}</span>
        </div>`);
        break;
      default:
      // no need to do anything
    }
  }
}
